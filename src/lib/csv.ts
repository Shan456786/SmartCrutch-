import type { LoadUnit, SessionRecord } from '../types';
import { fmtDuration, toUnit } from './format';

function escapeCell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sessionsToCSV(sessions: SessionRecord[], unit: LoadUnit): string {
  const header = [
    'Session ID',
    'Data source',
    'Started',
    'Ended',
    'Duration (s)',
    'Duration (hh:mm:ss)',
    `Average load (${unit})`,
    `Peak load (${unit})`,
    'Average |angle| (deg)',
    'Max |angle| (deg)',
    'Over-limit events',
    'Warning events',
    'Tilt events',
    'Time over limit (%)',
    'Estimated crutch strikes',
    `Max load threshold (${unit})`,
    'Warning level (%)',
    'Max tilt threshold (deg)',
  ];
  const d = unit === 'g' ? 0 : 2;
  const rows = sessions.map((s) => [
    s.id,
    s.source === 'demo' ? 'SIMULATED / DEMO DATA' : 'ESP32 HARDWARE (serial JSON protocol v1)',
    s.startedAt,
    s.endedAt,
    s.durationSec,
    fmtDuration(s.durationSec),
    toUnit(s.avgLoadKg, unit).toFixed(d),
    toUnit(s.peakLoadKg, unit).toFixed(d),
    s.avgAngleDeg.toFixed(2),
    s.maxAngleDeg.toFixed(2),
    s.overloadEvents,
    s.warningEvents,
    s.tiltEvents,
    s.timeOverLoadPct.toFixed(1),
    s.estimatedStrikes,
    toUnit(s.thresholds.maxLoadKg, unit).toFixed(unit === 'g' ? 0 : 1),
    s.thresholds.warnPercent,
    s.thresholds.maxTiltDeg,
  ]);
  return [header, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  // Prepend a BOM so spreadsheet apps detect UTF-8 correctly.
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
