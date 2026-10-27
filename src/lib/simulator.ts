/**
 * Demo-mode signal generator. Produces SIMULATED crutch load (kg) and crutch angle
 * from vertical (degrees) that loosely resemble a crutch-assisted gait: a loading
 * pulse during stance, near-zero load during swing, occasional rests, heavy-lean
 * episodes and tilt excursions. None of this represents real hardware behaviour.
 */
export class DemoSimulator {
  private phase = 0;
  private cycleSec = 1.25;
  private basePeak = 21;
  private tiltBias = 0;
  private restRemaining = 0;
  private leanRemaining = 0;
  private tiltRemaining = 0;
  private tiltTarget = 0;
  private restLoad = 3;

  next(dt: number): { loadKg: number; angleDeg: number } {
    // Slow random walks keep the signal looking alive over minutes.
    this.basePeak = clamp(this.basePeak + gauss() * 0.25, 13, 29);
    this.tiltBias = clamp(this.tiltBias * 0.995 + gauss() * 0.08, -6, 6);

    // Random episode triggers (per-second rates scaled by dt).
    if (this.restRemaining <= 0 && Math.random() < 0.025 * dt) {
      this.restRemaining = 3 + Math.random() * 5;
      this.restLoad = 2 + Math.random() * 4;
    }
    if (this.leanRemaining <= 0 && Math.random() < 0.05 * dt) this.leanRemaining = 2 + Math.random() * 3;
    if (this.tiltRemaining <= 0 && Math.random() < 0.03 * dt) {
      this.tiltRemaining = 0.8 + Math.random() * 1.2;
      this.tiltTarget = (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 14);
    }

    let load: number;
    let angle: number;

    if (this.restRemaining > 0) {
      this.restRemaining -= dt;
      load = this.restLoad + gauss() * 0.35;
      angle = this.tiltBias * 0.5 + gauss() * 0.6;
    } else {
      this.phase += dt / this.cycleSec;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.cycleSec = clamp(this.cycleSec + gauss() * 0.04, 1.0, 1.5);
      }
      const leanBoost = this.leanRemaining > 0 ? 1.32 + Math.random() * 0.06 : 1;
      if (this.leanRemaining > 0) this.leanRemaining -= dt;

      const stance = 0.58;
      if (this.phase < stance) {
        const p = this.phase / stance;
        load = this.basePeak * leanBoost * Math.pow(Math.sin(Math.PI * p), 1.4) + 0.8 + gauss() * 0.6;
      } else {
        load = 0.4 + Math.abs(gauss()) * 0.4;
      }
      angle = 13 * Math.sin(2 * Math.PI * this.phase + 0.6) + this.tiltBias + gauss() * 0.9;
    }

    if (this.tiltRemaining > 0) {
      this.tiltRemaining -= dt;
      angle = angle * 0.3 + this.tiltTarget * 0.7 + gauss() * 1.2;
    }

    return { loadKg: Math.max(0, load), angleDeg: clamp(angle, -60, 60) };
  }
}

function gauss(): number {
  // Box–Muller
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
