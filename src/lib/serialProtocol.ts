/**
 * SmartCrutch+ serial line protocol (v1).
 *
 * One JSON object per line, terminated by "\n" (a preceding "\r" is tolerated):
 *
 *   {"type":"smartcrutch","weight_g":123.4,"angle_deg":4.2,"unsafe":false}
 *
 *   type       must be exactly "smartcrutch"
 *   weight_g   finite number, grams, as computed by the firmware (HX711 read() / 230)
 *   angle_deg  finite number in [-180, 180], degrees, atan2(acc.y, acc.z) * 180 / PI
 *   unsafe     boolean, the firmware's own threshold decision
 *
 * Any other line (startup banners, debug prints, partial lines, NaN values,
 * wrong types) is ignored and counted — never turned into a reading.
 */

export const SERIAL_BAUD_RATE = 115200;
export const PROTOCOL_TYPE = 'smartcrutch';
export const EXAMPLE_LINE = '{"type":"smartcrutch","weight_g":123.4,"angle_deg":4.2,"unsafe":false}';
/** Lines longer than this cannot be protocol messages. */
export const MAX_LINE_LENGTH = 512;

export interface HardwareReading {
  weightG: number;
  angleDeg: number;
  unsafe: boolean;
}

export function parseProtocolLine(raw: string): HardwareReading | null {
  const line = raw.trim();
  if (line.length === 0 || line.length > MAX_LINE_LENGTH || line[0] !== '{') return null;
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return null;
  const m = msg as Record<string, unknown>;
  if (m.type !== PROTOCOL_TYPE) return null;
  const { weight_g, angle_deg, unsafe } = m;
  if (typeof weight_g !== 'number' || !Number.isFinite(weight_g)) return null;
  if (typeof angle_deg !== 'number' || !Number.isFinite(angle_deg) || angle_deg < -180 || angle_deg > 180) return null;
  if (typeof unsafe !== 'boolean') return null;
  return { weightG: weight_g, angleDeg: angle_deg, unsafe };
}
