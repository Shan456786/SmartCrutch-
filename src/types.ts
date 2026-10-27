export type DeviceMode = 'demo' | 'hardware';
export type LoadUnit = 'kg' | 'lb' | 'g';
export type ThemePreference = 'light' | 'dark' | 'system';

/** Example thresholds only — configurable, not clinical advice. Stored canonically in kg / degrees. */
export interface Thresholds {
  maxLoadKg: number;
  warnPercent: number;
  maxTiltDeg: number;
}

export interface Settings {
  mode: DeviceMode;
  loadUnit: LoadUnit;
  theme: ThemePreference;
  chartWindowSec: number;
  sampleRateHz: number;
  audibleAlerts: boolean;
  compactLayout: boolean;
}

export type Sex = '' | 'female' | 'male' | 'other' | 'undisclosed';
export type AffectedSide = '' | 'left' | 'right' | 'both';

export interface PatientProfile {
  fullName: string;
  patientId: string;
  dateOfBirth: string;
  sex: Sex;
  heightCm: string;
  weightKg: string;
  condition: string;
  affectedSide: AffectedSide;
  weightBearingStatus: string;
  rehabStartDate: string;
  clinicianName: string;
  clinicianContact: string;
  goals: string;
}

export interface RehabNote {
  id: string;
  createdAt: string;
  author: string;
  text: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  primary: boolean;
}

export interface SessionRecord {
  id: string;
  /** 'demo' = simulated readings; 'hardware' = parsed from the ESP32 serial protocol. */
  source: 'demo' | 'hardware';
  startedAt: string;
  endedAt: string;
  durationSec: number;
  sampleCount: number;
  avgLoadKg: number;
  peakLoadKg: number;
  avgAngleDeg: number;
  maxAngleDeg: number;
  overloadEvents: number;
  warningEvents: number;
  tiltEvents: number;
  timeOverLoadPct: number;
  estimatedStrikes: number;
  thresholds: Thresholds;
  /** Down-sampled peak-load trace (kg) for sparklines. */
  trace: number[];
}

export type ActivityKind = 'session' | 'safety' | 'profile' | 'settings' | 'emergency' | 'device';

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  message: string;
}

export interface Sample {
  /** ms since stream start */
  t: number;
  loadKg: number;
  angleDeg: number;
}

export type LoadZone = 'safe' | 'caution' | 'over';

export type RouteId = 'dashboard' | 'live' | 'safety' | 'history' | 'profile' | 'settings';
