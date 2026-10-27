import { useState, type FormEvent } from 'react';
import { Info, RotateCcw, Save } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { Field } from './ui';
import { ConfirmDialog } from './ConfirmDialog';
import { DEFAULT_THRESHOLDS, THRESHOLD_LIMITS } from '../lib/defaults';
import { fmtLoad, fromUnit, toUnit } from '../lib/format';
import type { LoadUnit, Thresholds } from '../types';

interface Draft {
  maxLoad: string;
  warnPercent: string;
  maxTilt: string;
}
type Errors = Partial<Record<keyof Draft, string>>;

const toDraft = (t: Thresholds, unit: LoadUnit): Draft => ({
  maxLoad: (Math.round(toUnit(t.maxLoadKg, unit) * 10) / 10).toString(),
  warnPercent: t.warnPercent.toString(),
  maxTilt: t.maxTiltDeg.toString(),
});

function validate(d: Draft, unit: LoadUnit): Errors {
  const e: Errors = {};
  const lim = THRESHOLD_LIMITS;
  const ml = Number(d.maxLoad);
  const lo = toUnit(lim.maxLoadKg.min, unit);
  const hi = toUnit(lim.maxLoadKg.max, unit);
  if (d.maxLoad.trim() === '' || !Number.isFinite(ml)) e.maxLoad = 'Enter a number.';
  else if (ml < lo || ml > hi) e.maxLoad = `Must be between ${lo.toFixed(0)} and ${hi.toFixed(0)} ${unit}.`;
  const wp = Number(d.warnPercent);
  if (d.warnPercent.trim() === '' || !Number.isInteger(wp)) e.warnPercent = 'Enter a whole number.';
  else if (wp < lim.warnPercent.min || wp > lim.warnPercent.max) e.warnPercent = `Must be between ${lim.warnPercent.min} and ${lim.warnPercent.max}%.`;
  const mt = Number(d.maxTilt);
  if (d.maxTilt.trim() === '' || !Number.isFinite(mt)) e.maxTilt = 'Enter a number.';
  else if (mt < lim.maxTiltDeg.min || mt > lim.maxTiltDeg.max) e.maxTilt = `Must be between ${lim.maxTiltDeg.min}° and ${lim.maxTiltDeg.max}°.`;
  return e;
}

/**
 * Editable safety thresholds. Render with `key={...thresholds + unit}` so the draft
 * resets whenever the saved values or display unit change.
 */
export function ThresholdForm({ idPrefix }: { idPrefix: string }) {
  const { thresholds, saveThresholds, settings, notify } = useApp();
  const unit = settings.loadUnit;
  const [draft, setDraft] = useState<Draft>(() => toDraft(thresholds, unit));
  const [errors, setErrors] = useState<Errors>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(thresholds, unit));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(draft, unit);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      notify('Please fix the highlighted threshold values.', 'error');
      return;
    }
    saveThresholds({
      maxLoadKg: Math.round(fromUnit(Number(draft.maxLoad), unit) * 100) / 100,
      warnPercent: Number(draft.warnPercent),
      maxTiltDeg: Number(draft.maxTilt),
    });
    notify('Thresholds saved');
  };

  const input = (key: keyof Draft, label: string, hint: string, mode: 'decimal' | 'numeric') => {
    const id = `${idPrefix}-${key}`;
    return (
      <Field label={label} htmlFor={id} error={errors[key]} hint={hint} required>
        <input
          id={id}
          inputMode={mode}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${id}-error` : undefined}
        />
      </Field>
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        {input('maxLoad', `Maximum crutch load (${unit})`, 'Readings above this are flagged as over the limit.', 'decimal')}
        {input('warnPercent', 'Warning level (% of maximum)', 'Shows “approaching limit” from this point.', 'numeric')}
        {input('maxTilt', 'Maximum tilt from vertical (°)', 'Angles beyond ± this value raise a tilt alert.', 'decimal')}
      </div>
      <p className="fine">
        <Info size={13} aria-hidden /> These are configurable <strong>example</strong> values, not clinical advice. A physiotherapist or clinician should decide
        real limits.
      </p>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
          <RotateCcw size={16} /> Reset to examples
        </button>
        {dirty && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setDraft(toDraft(thresholds, unit));
              setErrors({});
            }}
          >
            Discard changes
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={!dirty}>
          <Save size={16} /> Save thresholds
        </button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset thresholds to example values?"
        confirmLabel="Reset thresholds"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          saveThresholds(DEFAULT_THRESHOLDS);
          notify('Thresholds reset to example values');
        }}
      >
        <p>
          Maximum load {fmtLoad(DEFAULT_THRESHOLDS.maxLoadKg, unit)}, warning at {DEFAULT_THRESHOLDS.warnPercent}%, maximum tilt {DEFAULT_THRESHOLDS.maxTiltDeg}°.
        </p>
      </ConfirmDialog>
    </form>
  );
}

export const thresholdFormKey = (t: Thresholds, unit: LoadUnit) => `${t.maxLoadKg}|${t.warnPercent}|${t.maxTiltDeg}|${unit}`;
