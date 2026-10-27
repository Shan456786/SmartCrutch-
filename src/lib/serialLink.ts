/**
 * Minimal Web Serial transport: opens a user-selected port, splits incoming bytes
 * into newline-delimited text lines and reports when the port goes away.
 * It knows nothing about the message format — see serialProtocol.ts.
 */
import { MAX_LINE_LENGTH } from './serialProtocol';

// Web Serial is not in TypeScript's DOM lib; declare only what we use.
export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}
export interface SerialPortLike extends EventTarget {
  readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}
interface SerialLike extends EventTarget {
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPortLike>;
}

export function getSerial(): SerialLike | null {
  const nav = navigator as Navigator & { serial?: SerialLike };
  return nav.serial ?? null;
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && getSerial() !== null && window.isSecureContext;
}

export type CloseReason = 'user' | 'lost';

export class SerialLink {
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private closing = false;
  private readonly onLine: (line: string) => void;
  private readonly onClosed: (reason: CloseReason, message?: string) => void;

  constructor(onLine: (line: string) => void, onClosed: (reason: CloseReason, message?: string) => void) {
    this.onLine = onLine;
    this.onClosed = onClosed;
  }

  get isOpen(): boolean {
    return this.port !== null;
  }

  /** Opens an already-selected port. Throws if the port cannot be opened. */
  async open(port: SerialPortLike, baudRate: number): Promise<void> {
    await port.open({ baudRate });
    this.port = port;
    this.closing = false;
    port.addEventListener('disconnect', this.handleDisconnect);
    void this.readLoop(port);
  }

  async close(): Promise<void> {
    const port = this.port;
    if (!port) return;
    this.closing = true;
    try {
      await this.reader?.cancel();
    } catch {
      /* already released */
    }
    await this.teardown(port);
    this.onClosed('user');
  }

  private handleDisconnect = () => {
    // The USB device was unplugged; the read loop will also fail, but report promptly.
    const port = this.port;
    if (!port || this.closing) return;
    this.closing = true;
    void this.teardown(port).then(() => this.onClosed('lost', 'The USB serial device was disconnected.'));
  };

  private async readLoop(port: SerialPortLike): Promise<void> {
    const decoder = new TextDecoder();
    let pending = '';
    let fatal: string | undefined;

    // Non-fatal errors (framing, parity, buffer overrun) give the port a fresh `readable`, so keep looping.
    while (port.readable && !this.closing) {
      const reader = port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          pending += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0, nl).replace(/\r$/, '');
            pending = pending.slice(nl + 1);
            if (line.trim()) this.onLine(line);
          }
          // Garbage with no newline (wrong baud rate, binary output) must not grow forever.
          if (pending.length > MAX_LINE_LENGTH * 4) pending = '';
        }
      } catch (err) {
        if (!this.closing) fatal = err instanceof Error ? err.message : String(err);
      } finally {
        reader.releaseLock();
        this.reader = null;
      }
    }

    if (!this.closing && this.port === port) {
      this.closing = true;
      await this.teardown(port);
      this.onClosed('lost', fatal ? `Serial connection lost: ${fatal}` : 'The serial port stopped sending data and was closed.');
    }
  }

  private async teardown(port: SerialPortLike): Promise<void> {
    port.removeEventListener('disconnect', this.handleDisconnect);
    try {
      await port.close();
    } catch {
      /* port already closed or device gone */
    }
    if (this.port === port) this.port = null;
  }
}

/** Human-readable explanation for errors thrown by requestPort()/open(). */
export function describeSerialError(err: unknown, phase: 'select' | 'open'): { message: string; cancelled: boolean } {
  const name = err instanceof DOMException ? err.name : err instanceof Error ? err.name : '';
  const detail = err instanceof Error ? err.message : String(err);
  if (phase === 'select') {
    if (name === 'NotFoundError') return { message: 'No serial port was selected.', cancelled: true };
    if (name === 'SecurityError') return { message: 'The browser blocked serial access. Use Chrome or Edge on http://localhost or HTTPS.', cancelled: false };
    return { message: `Could not choose a serial port: ${detail}`, cancelled: false };
  }
  if (name === 'InvalidStateError') return { message: 'That port is already open in this browser. Disconnect it first.', cancelled: false };
  if (name === 'NetworkError')
    return { message: 'The port could not be opened. Close the Arduino IDE Serial Monitor or any other program using it, then try again.', cancelled: false };
  return { message: `The port could not be opened: ${detail}`, cancelled: false };
}
