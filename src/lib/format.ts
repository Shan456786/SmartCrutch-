import type { LoadUnit, LoadZone, Thresholds } from '../types';

export const KG_TO_LB = 2.20462;

export function toUnit(kg: number, unit: LoadUnit): number {
  return unit === 'kg' ? kg : unit === 'g' ? kg * 1000 : kg * KG_TO_LB;
}

export function fromUnit(value: number, unit: LoadUnit): number {
  return unit === 'kg' ? value : unit === 'g' ? value / 1000 : value / KG_TO_LB;
}

/** Sensible decimal places for a unit (grams are shown as whole numbers). */
export function unitDigits(unit: LoadUnit, digits = 1): number {
  return unit === 'g' ? 0 : digits;
}

export function fmtLoad(kg: number, unit: LoadUnit, digits = 1): string {
  return `${toUnit(kg, unit).toFixed(unitDigits(unit, digits))} ${unit}`;
}

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function fmtDurationWords(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function loadZone(kg: number, t: Thresholds): LoadZone {
  if (kg > t.maxLoadKg) return 'over';
  if (kg >= (t.maxLoadKg * t.warnPercent) / 100) return 'caution';
  return 'safe';
}

export const zoneLabel: Record<LoadZone, string> = {
  safe: 'Within limit',
  caution: 'Approaching limit',
  over: 'Above limit',
};

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
