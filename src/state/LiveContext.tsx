import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { LoadZone, Sample, SessionRecord } from '../types';
import { DemoSimulator } from '../lib/simulator';
import { SessionAccumulator } from '../lib/sessionStats';
import { loadZone, fmtDurationWords } from '../lib/format';
import { STORAGE_KEYS, isArray, loadJSON, saveJSON } from '../lib/storage';
import { SERIAL_BAUD_RATE, parseProtocolLine } from '../lib/serialProtocol';
import { SerialLink, describeSerialError, getSerial, isWebSerialSupported, type CloseReason, type SerialPortLike } from '../lib/serialLink';
import { useApp } from './AppContext';

const BUFFER_SEC = 125;
/** With no valid message for this long, "Live Data Received" falls back to "Waiting for Data". */
export const HW_STALE_MS = 3000;

export type SerialStatus = 'unsupported' | 'disconnected' | 'connecting' | 'waiting' | 'live';

export const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = {
  unsupported: 'Web Serial not supported',
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  waiting: 'Connected — Waiting for Data',
  live: 'Live Data Received',
};

export interface SerialInfo {
  status: SerialStatus;
  /** Last connection problem, shown until the next connect attempt. */
  error: string | null;
  portLabel: string | null;
  validMessages: number;
  ignoredLines: number;
  lastRawLine: string | null;
  lastValidAt: number | null;
  /** Firmware's own `unsafe` flag from the latest valid message. */
  deviceUnsafe: boolean | null;
  /** True when at least one valid message arrived before data stopped (status fell back to waiting). */
  stale: boolean;
}

interface LiveSessionStats {
  elapsedSec: number;
  peakLoadKg: number;
  overloadEvents: number;
  warningEvents: number;
  tiltEvents: number;
  strikes: number;
  samples: number;
}

interface LiveState {
  /** True when there is a current reading from the active source (simulator or parsed hardware data). */
  streaming: boolean;
  isSimulated: boolean;
  latest: Sample | null;
  buffer: Sample[];
  frame: number;
  zone: LoadZone;
  tiltAlert: boolean;
  recording: boolean;
  /** Sessions can be recorded in demo mode, or in hardware mode once real data is arriving. */
  canRecord: boolean;
  session: LiveSessionStats | null;
  startSession: () => boolean;
  stopSession: () => SessionRecord | null;
  serial: SerialInfo;
  connectHardware: () => Promise<void>;
  disconnectHardware: () => Promise<void>;
}

const LiveContext = createContext<LiveState | null>(null);

const INITIAL_COUNTERS = { validMessages: 0, ignoredLines: 0, lastRawLine: null as string | null, lastValidAt: null as number | null, deviceUnsafe: null as boolean | null };

export function LiveProvider({ children }: { children: ReactNode }) {
  const { settings, thresholds, addSession, logActivity, notify } = useApp();
  const isDemo = settings.mode === 'demo';
  const supported = isWebSerialSupported();

  const bufferRef = useRef<Sample[]>([]);
  const streamStartRef = useRef(Date.now());
  const simRef = useRef(new DemoSimulator());
  const accRef = useRef<SessionAccumulator | null>(null);
  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;
  const alertsRef = useRef(settings.audibleAlerts);
  alertsRef.current = settings.audibleAlerts;
  const alertStateRef = useRef({ prevZone: 'safe' as LoadZone, prevTilt: false, lastBeep: 0 });

  const [frame, setFrame] = useState(0);
  const [recording, setRecording] = useState(false);

  // --- shared ingestion -------------------------------------------------------
  const frameQueued = useRef(false);
  const requestFrame = useCallback(() => {
    if (frameQueued.current) return;
    frameQueued.current = true;
    requestAnimationFrame(() => {
      frameQueued.current = false;
      setFrame((f) => f + 1);
    });
  }, []);

  const resetStream = useCallback(() => {
    bufferRef.current = [];
    streamStartRef.current = Date.now();
    alertStateRef.current = { prevZone: 'safe', prevTilt: false, lastBeep: 0 };
  }, []);

  const pushSample = useCallback((sample: Sample) => {
    const buf = bufferRef.current;
    buf.push(sample);
    accRef.current?.add(sample.loadKg, sample.angleDeg, thresholdsRef.current);
    const cutoff = sample.t - BUFFER_SEC * 1000;
    while (buf.length > 0 && buf[0].t < cutoff) buf.shift();

    const st = alertStateRef.current;
    const zone = loadZone(sample.loadKg, thresholdsRef.current);
    const tilt = Math.abs(sample.angleDeg) > thresholdsRef.current.maxTiltDeg;
    const now = performance.now();
    if (alertsRef.current && ((zone === 'over' && st.prevZone !== 'over') || (tilt && !st.prevTilt)) && now - st.lastBeep > 1500) {
      st.lastBeep = now;
      beep();
    }
    st.prevZone = zone;
    st.prevTilt = tilt;
  }, []);

  // --- demo source -------------------------------------------------------------
  // Only runs in demo mode. Hardware mode never receives simulated values.
  useEffect(() => {
    resetStream();
    setFrame((f) => f + 1);
    if (!isDemo) return;
    let last = performance.now();
    const stepSec = 1 / settings.sampleRateHz;
    const id = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(10, (now - last) / 1000);
      // Background tabs throttle timers — fill the gap with the correct number of samples.
      const steps = Math.max(1, Math.round(elapsed / stepSec));
      last = now;
      const t0 = Date.now() - streamStartRef.current;
      for (let i = steps - 1; i >= 0; i--) {
        const s = simRef.current.next(stepSec);
        pushSample({ t: t0 - i * stepSec * 1000, loadKg: s.loadKg, angleDeg: s.angleDeg });
      }
      setFrame((f) => f + 1);
    }, 1000 / settings.sampleRateHz);
    return () => window.clearInterval(id);
  }, [isDemo, settings.sampleRateHz, pushSample, resetStream]);

  // --- hardware source (Web Serial) ----------------------------------------------
  const [serialStatus, setSerialStatus] = useState<SerialStatus>(supported ? 'disconnected' : 'unsupported');
  const [serialError, setSerialError] = useState<string | null>(null);
  const [portLabel, setPortLabel] = useState<string | null>(null);
  const countersRef = useRef({ ...INITIAL_COUNTERS });
  const isDemoRef = useRef(isDemo);
  isDemoRef.current = isDemo;

  const onLine = useCallback(
    (line: string) => {
      const c = countersRef.current;
      c.lastRawLine = line.length > 200 ? `${line.slice(0, 200)}…` : line;
      const reading = parseProtocolLine(line);
      if (!reading || isDemoRef.current) {
        c.ignoredLines++;
        requestFrame();
        return;
      }
      c.validMessages++;
      c.lastValidAt = Date.now();
      c.deviceUnsafe = reading.unsafe;
      pushSample({ t: Date.now() - streamStartRef.current, loadKg: reading.weightG / 1000, angleDeg: reading.angleDeg });
      setSerialStatus((s) => (s === 'waiting' ? 'live' : s));
      requestFrame();
    },
    [pushSample, requestFrame],
  );

  // The link's close callback needs the latest stopSession; keep it in a ref.
  const onClosedRef = useRef<(reason: CloseReason, message?: string) => void>(() => {});
  const linkRef = useRef<SerialLink | null>(null);
  if (linkRef.current === null) {
    linkRef.current = new SerialLink(onLine, (reason, message) => onClosedRef.current(reason, message));
  }

  const startSession = useCallback((): boolean => {
    if (accRef.current) return false;
    if (!isDemo && serialStatus !== 'live') {
      notify('No live hardware data is arriving yet, so there is nothing to record.', 'error');
      return false;
    }
    accRef.current = new SessionAccumulator(Date.now(), isDemo ? 'demo' : 'hardware');
    setRecording(true);
    logActivity('session', isDemo ? 'Simulated session started' : 'Hardware session started');
    notify(isDemo ? 'Session recording started (simulated data)' : 'Session recording started (live hardware data)', 'info');
    return true;
  }, [isDemo, serialStatus, notify, logActivity]);

  const stopSession = useCallback((): SessionRecord | null => {
    const acc = accRef.current;
    if (!acc) return null;
    accRef.current = null;
    setRecording(false);
    const record = acc.finish(Date.now(), thresholdsRef.current);
    addSession(record);
    const label = record.source === 'demo' ? 'Simulated' : 'Hardware';
    logActivity('session', `${label} session saved · ${fmtDurationWords(record.durationSec)}`);
    notify(`${label} session saved (${fmtDurationWords(record.durationSec)}). View it in Session History.`, 'success');
    return record;
  }, [addSession, logActivity, notify]);

  onClosedRef.current = (reason, message) => {
    setSerialStatus(supported ? 'disconnected' : 'unsupported');
    setPortLabel(null);
    if (accRef.current?.source === 'hardware') stopSession();
    resetStream();
    requestFrame();
    if (reason === 'lost') {
      setSerialError(message ?? 'The serial connection was lost.');
      notify(message ?? 'The serial connection was lost.', 'error');
      logActivity('device', 'Hardware serial connection lost');
    } else {
      logActivity('device', 'Hardware serial port disconnected');
    }
  };

  const connectHardware = useCallback(async () => {
    const serial = getSerial();
    if (!serial || !isWebSerialSupported()) {
      setSerialStatus('unsupported');
      notify('This browser does not support Web Serial. Use desktop Chrome or Edge on http://localhost.', 'error');
      return;
    }
    const link = linkRef.current!;
    if (link.isOpen) return;
    setSerialError(null);
    let port: SerialPortLike;
    try {
      // Must be the first await after the click so the browser keeps the user gesture.
      port = await serial.requestPort();
    } catch (err) {
      const { message, cancelled } = describeSerialError(err, 'select');
      if (cancelled) notify(message, 'info');
      else {
        setSerialError(message);
        notify(message, 'error');
      }
      return;
    }
    setSerialStatus('connecting');
    countersRef.current = { ...INITIAL_COUNTERS };
    resetStream();
    try {
      await link.open(port, SERIAL_BAUD_RATE);
    } catch (err) {
      const { message } = describeSerialError(err, 'open');
      setSerialStatus('disconnected');
      setSerialError(message);
      notify(message, 'error');
      return;
    }
    const info = port.getInfo();
    const hex = (n?: number) => (n === undefined ? '' : n.toString(16).padStart(4, '0').toUpperCase());
    setPortLabel(info.usbVendorId !== undefined ? `USB ${hex(info.usbVendorId)}:${hex(info.usbProductId)}` : 'Serial port');
    setSerialStatus('waiting');
    logActivity('device', `Hardware serial port opened at ${SERIAL_BAUD_RATE} baud`);
    notify('Port opened. Waiting for SmartCrutch+ data from the ESP32…', 'info');
  }, [notify, logActivity, resetStream]);

  const disconnectHardware = useCallback(async () => {
    await linkRef.current?.close();
  }, []);

  // Live → waiting when valid data stops arriving.
  useEffect(() => {
    if (serialStatus !== 'live') return;
    const id = window.setInterval(() => {
      const last = countersRef.current.lastValidAt;
      if (last === null || Date.now() - last > HW_STALE_MS) setSerialStatus('waiting');
    }, 500);
    return () => window.clearInterval(id);
  }, [serialStatus]);

  // Switching mode while recording stops and saves the session; switching to demo closes the serial port.
  useEffect(() => {
    if (accRef.current && accRef.current.source !== (isDemo ? 'demo' : 'hardware')) stopSession();
    if (isDemo && linkRef.current?.isOpen) void linkRef.current.close();
  }, [isDemo, stopSession]);

  // Close the port and keep a running session if the tab is closed or reloaded.
  useEffect(() => {
    const onUnload = () => {
      const acc = accRef.current;
      if (acc) {
        const record = acc.finish(Date.now(), thresholdsRef.current);
        const existing = loadJSON<SessionRecord[]>(STORAGE_KEYS.sessions, [], isArray);
        saveJSON(STORAGE_KEYS.sessions, [record, ...existing]);
      }
      void linkRef.current?.close();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const buffer = bufferRef.current;
  const latest = buffer.length > 0 ? buffer[buffer.length - 1] : null;
  const acc = accRef.current;
  const c = countersRef.current;

  const value: LiveState = {
    streaming: latest !== null && (isDemo || serialStatus === 'live'),
    isSimulated: isDemo,
    latest,
    buffer,
    frame,
    zone: latest ? loadZone(latest.loadKg, thresholds) : 'safe',
    tiltAlert: latest ? Math.abs(latest.angleDeg) > thresholds.maxTiltDeg : false,
    recording,
    canRecord: isDemo || serialStatus === 'live',
    session: acc
      ? {
          elapsedSec: (Date.now() - acc.startedAt) / 1000,
          peakLoadKg: acc.peakLoadKg,
          overloadEvents: acc.overloadEvents,
          warningEvents: acc.warningEvents,
          tiltEvents: acc.tiltEvents,
          strikes: acc.strikes,
          samples: acc.sampleCount,
        }
      : null,
    startSession,
    stopSession,
    serial: {
      status: serialStatus,
      error: serialError,
      portLabel,
      validMessages: c.validMessages,
      ignoredLines: c.ignoredLines,
      lastRawLine: c.lastRawLine,
      lastValidAt: c.lastValidAt,
      deviceUnsafe: c.deviceUnsafe,
      stale: serialStatus === 'waiting' && c.validMessages > 0,
    },
    connectHardware,
    disconnectHardware,
  };

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveState {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used inside <LiveProvider>');
  return ctx;
}

let audioCtx: AudioContext | null = null;
export function beep(): void {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.32);
  } catch {
    /* Audio unavailable — visual alerts still shown. */
  }
}
