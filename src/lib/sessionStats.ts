import type { LoadZone, SessionRecord, Thresholds } from '../types';
import { loadZone, uid } from './format';
import { DemoSimulator } from './simulator';

// Strike detection hysteresis, relative to the configured limit so it works for any load scale.
const STRIKE_ON_FRACTION = 0.2;
const STRIKE_OFF_FRACTION = 0.08;
const TRACE_POINTS = 60;

/** Incrementally accumulates statistics for one recording session. */
export class SessionAccumulator {
  readonly startedAt: number;
  readonly source: SessionRecord['source'];
  private n = 0;
  private sumLoad = 0;
  private sumAngle = 0;
  private peakLoad = 0;
  private maxAngle = 0;
  private overSamples = 0;
  overloadEvents = 0;
  warningEvents = 0;
  tiltEvents = 0;
  strikes = 0;
  private prevZone: LoadZone = 'safe';
  private prevTilt = false;
  private inStance = false;
  private loads: number[] = [];

  constructor(startedAt: number, source: SessionRecord['source']) {
    this.startedAt = startedAt;
    this.source = source;
  }

  add(loadKg: number, angleDeg: number, t: Thresholds): void {
    this.n++;
    this.sumLoad += loadKg;
    const absAngle = Math.abs(angleDeg);
    this.sumAngle += absAngle;
    this.peakLoad = Math.max(this.peakLoad, loadKg);
    this.maxAngle = Math.max(this.maxAngle, absAngle);
    this.loads.push(loadKg);

    const zone = loadZone(loadKg, t);
    if (zone === 'over') this.overSamples++;
    if (zone === 'over' && this.prevZone !== 'over') this.overloadEvents++;
    if (zone === 'caution' && this.prevZone === 'safe') this.warningEvents++;
    this.prevZone = zone;

    const tilt = absAngle > t.maxTiltDeg;
    if (tilt && !this.prevTilt) this.tiltEvents++;
    this.prevTilt = tilt;

    if (!this.inStance && loadKg > t.maxLoadKg * STRIKE_ON_FRACTION) {
      this.inStance = true;
      this.strikes++;
    } else if (this.inStance && loadKg < t.maxLoadKg * STRIKE_OFF_FRACTION) {
      this.inStance = false;
    }
  }

  get sampleCount(): number {
    return this.n;
  }

  get peakLoadKg(): number {
    return this.peakLoad;
  }

  finish(endedAt: number, thresholds: Thresholds): SessionRecord {
    const n = Math.max(1, this.n);
    return {
      id: uid(),
      source: this.source,
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationSec: Math.max(0, Math.round((endedAt - this.startedAt) / 1000)),
      sampleCount: this.n,
      avgLoadKg: this.sumLoad / n,
      peakLoadKg: this.peakLoad,
      avgAngleDeg: this.sumAngle / n,
      maxAngleDeg: this.maxAngle,
      overloadEvents: this.overloadEvents,
      warningEvents: this.warningEvents,
      tiltEvents: this.tiltEvents,
      timeOverLoadPct: (this.overSamples / n) * 100,
      estimatedStrikes: this.strikes,
      thresholds: { ...thresholds },
      trace: downsampleMax(this.loads, TRACE_POINTS),
    };
  }
}

function downsampleMax(values: number[], points: number): number[] {
  if (values.length <= points) return values.map((v) => round1(v));
  const out: number[] = [];
  const size = values.length / points;
  for (let i = 0; i < points; i++) {
    let m = 0;
    const end = Math.floor((i + 1) * size);
    for (let j = Math.floor(i * size); j < end; j++) m = Math.max(m, values[j]);
    out.push(round1(m));
  }
  return out;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Generates a SIMULATED session by running the demo simulator offline.
 * Used by "Generate sample sessions" so the history page can be explored quickly.
 */
export function generateDemoSession(endedAt: number, durationSec: number, thresholds: Thresholds): SessionRecord {
  const sim = new DemoSimulator();
  const rate = 10;
  const startedAt = endedAt - durationSec * 1000;
  const acc = new SessionAccumulator(startedAt, 'demo');
  for (let i = 0; i < durationSec * rate; i++) {
    const s = sim.next(1 / rate);
    acc.add(s.loadKg, s.angleDeg, thresholds);
  }
  return acc.finish(endedAt, thresholds);
}
