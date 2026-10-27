import type { PatientProfile, Settings, Thresholds } from '../types';

/** Example values for demonstration. Not clinical guidance — a clinician should set real limits. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  maxLoadKg: 30,
  warnPercent: 85,
  maxTiltDeg: 25,
};

/** The thresholds hard-coded in the current ESP32 firmware (800 g, 20°), for one-click alignment. */
export const FIRMWARE_THRESHOLDS: Thresholds = {
  maxLoadKg: 0.8,
  warnPercent: 85,
  maxTiltDeg: 20,
};

export const THRESHOLD_LIMITS = {
  maxLoadKg: { min: 0.1, max: 150 },
  warnPercent: { min: 50, max: 99 },
  maxTiltDeg: { min: 5, max: 60 },
} as const;

export const DEFAULT_SETTINGS: Settings = {
  mode: 'demo',
  loadUnit: 'kg',
  theme: 'light',
  chartWindowSec: 30,
  sampleRateHz: 10,
  audibleAlerts: false,
  compactLayout: false,
};

export const EMPTY_PROFILE: PatientProfile = {
  fullName: '',
  patientId: '',
  dateOfBirth: '',
  sex: '',
  heightCm: '',
  weightKg: '',
  condition: '',
  affectedSide: '',
  weightBearingStatus: '',
  rehabStartDate: '',
  clinicianName: '',
  clinicianContact: '',
  goals: '',
};

export const WEIGHT_BEARING_OPTIONS = [
  'Non-weight-bearing (NWB)',
  'Toe-touch weight-bearing (TTWB)',
  'Partial weight-bearing (PWB)',
  'Weight-bearing as tolerated (WBAT)',
  'Full weight-bearing (FWB)',
];

export const CHART_WINDOWS = [15, 30, 60, 120];
export const SAMPLE_RATES = [5, 10, 20];
