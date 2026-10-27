import { useState, type FormEvent } from 'react';
import { ClipboardList, NotebookPen, Plus, Save, Trash2, UserRound } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { Badge, Card, EmptyState, Field, PageHeader } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { WEIGHT_BEARING_OPTIONS } from '../lib/defaults';
import { fmtDate, fmtDateTime, fmtLoad } from '../lib/format';
import type { PatientProfile, RehabNote } from '../types';

type Errors = Partial<Record<keyof PatientProfile, string>>;

function ageFrom(dob: string): number | null {
  const d = new Date(dob);
  if (!dob || Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
}

function validate(p: PatientProfile): Errors {
  const e: Errors = {};
  const name = p.fullName.trim();
  if (!name) e.fullName = 'Full name is required.';
  else if (name.length < 2 || name.length > 80) e.fullName = 'Name should be 2–80 characters.';
  else if (!/^[\p{L}\p{M}' .-]+$/u.test(name)) e.fullName = 'Use letters, spaces, apostrophes, hyphens or full stops only.';

  if (p.patientId && !/^[A-Za-z0-9-]{1,20}$/.test(p.patientId.trim())) e.patientId = 'Use up to 20 letters, digits or hyphens.';

  if (p.dateOfBirth) {
    const age = ageFrom(p.dateOfBirth);
    if (age === null) e.dateOfBirth = 'Enter a valid date.';
    else if (new Date(p.dateOfBirth).getTime() > Date.now()) e.dateOfBirth = 'Date of birth cannot be in the future.';
    else if (age > 120) e.dateOfBirth = 'Please check the year — age would be over 120.';
  }

  const num = (v: string, key: 'heightCm' | 'weightKg', lo: number, hi: number, label: string) => {
    if (!v.trim()) return;
    const n = Number(v);
    if (!Number.isFinite(n)) e[key] = `${label} must be a number.`;
    else if (n < lo || n > hi) e[key] = `${label} should be between ${lo} and ${hi}.`;
  };
  num(p.heightCm, 'heightCm', 50, 250, 'Height (cm)');
  num(p.weightKg, 'weightKg', 20, 300, 'Weight (kg)');

  if (p.rehabStartDate) {
    const d = new Date(p.rehabStartDate);
    if (Number.isNaN(d.getTime())) e.rehabStartDate = 'Enter a valid date.';
    else if (p.dateOfBirth && d < new Date(p.dateOfBirth)) e.rehabStartDate = 'Start date cannot be before date of birth.';
    else if (d.getTime() > Date.now() + 365 * 86400000) e.rehabStartDate = 'Start date is more than a year away — please check it.';
  }

  const c = p.clinicianContact.trim();
  if (c) {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
    const digits = c.replace(/\D/g, '');
    const isPhone = /^\+?[\d\s().-]+$/.test(c) && digits.length >= 6 && digits.length <= 15;
    if (!isEmail && !isPhone) e.clinicianContact = 'Enter a valid email address or phone number.';
  }
  if (p.goals.length > 1000) e.goals = `Keep goals under 1000 characters (currently ${p.goals.length}).`;
  if (p.condition.length > 120) e.condition = 'Keep this under 120 characters.';
  return e;
}

export function PatientProfilePage() {
  const { profile, saveProfile, notes, addNote, deleteNote, thresholds, settings, notify, logActivity } = useApp();
  const [draft, setDraft] = useState<PatientProfile>(profile);
  const [errors, setErrors] = useState<Errors>({});
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);

  const set = <K extends keyof PatientProfile>(k: K, v: PatientProfile[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      notify(`Please fix ${Object.keys(errs).length} field(s) before saving.`, 'error');
      const first = document.getElementById(`p-${Object.keys(errs)[0]}`);
      first?.focus();
      return;
    }
    const clean: PatientProfile = { ...draft, fullName: draft.fullName.trim(), patientId: draft.patientId.trim(), clinicianContact: draft.clinicianContact.trim() };
    saveProfile(clean);
    setDraft(clean);
    notify('Patient profile saved');
  };

  // Notes
  const [noteAuthor, setNoteAuthor] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteError, setNoteError] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<RehabNote | null>(null);

  const submitNote = (e: FormEvent) => {
    e.preventDefault();
    const text = noteText.trim();
    if (text.length < 3) {
      setNoteError('Write at least 3 characters.');
      return;
    }
    if (text.length > 2000) {
      setNoteError('Notes are limited to 2000 characters.');
      return;
    }
    addNote(noteAuthor.trim() || 'Unspecified', text);
    setNoteText('');
    setNoteError('');
    notify('Note added');
  };

  const field = (key: keyof PatientProfile, label: string, opts: { type?: string; hint?: string; required?: boolean; placeholder?: string; inputMode?: 'decimal' } = {}) => (
    <Field label={label} htmlFor={`p-${key}`} error={errors[key]} hint={opts.hint} required={opts.required}>
      <input
        id={`p-${key}`}
        type={opts.type ?? 'text'}
        inputMode={opts.inputMode}
        placeholder={opts.placeholder}
        value={draft[key]}
        onChange={(e) => set(key, e.target.value as never)}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `p-${key}-error` : undefined}
      />
    </Field>
  );

  const age = ageFrom(profile.dateOfBirth);
  const weight = Number(profile.weightKg);
  const initials = profile.fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';

  return (
    <>
      <PageHeader
        title="Patient Profile"
        subtitle="Patient details and rehabilitation notes, stored only in this browser."
        actions={
          dirty && (
            <Badge tone="amber" dot>
              Unsaved changes
            </Badge>
          )
        }
      />

      <div className="grid profile-grid">
        <Card title="Patient details" icon={<UserRound size={18} />}>
          <form onSubmit={submit} noValidate>
            <div className="form-grid">
              {field('fullName', 'Full name', { required: true })}
              {field('patientId', 'Patient / reference ID', { hint: 'Optional, e.g. a study ID.' })}
              {field('dateOfBirth', 'Date of birth', { type: 'date' })}
              <Field label="Sex" htmlFor="p-sex">
                <select id="p-sex" value={draft.sex} onChange={(e) => set('sex', e.target.value as PatientProfile['sex'])}>
                  <option value="">Not specified</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                  <option value="undisclosed">Prefer not to say</option>
                </select>
              </Field>
              {field('heightCm', 'Height (cm)', { inputMode: 'decimal' })}
              {field('weightKg', 'Body weight (kg)', { inputMode: 'decimal', hint: 'Used to show the load limit as % of body weight.' })}
              {field('condition', 'Injury / condition', { placeholder: 'e.g. Right ankle fracture' })}
              <Field label="Affected side" htmlFor="p-affectedSide">
                <select id="p-affectedSide" value={draft.affectedSide} onChange={(e) => set('affectedSide', e.target.value as PatientProfile['affectedSide'])}>
                  <option value="">Not specified</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="both">Both</option>
                </select>
              </Field>
              <Field label="Weight-bearing status (as prescribed)" htmlFor="p-weightBearingStatus" hint="Record what the clinician prescribed.">
                <select id="p-weightBearingStatus" value={draft.weightBearingStatus} onChange={(e) => set('weightBearingStatus', e.target.value)}>
                  <option value="">Not specified</option>
                  {WEIGHT_BEARING_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
              {field('rehabStartDate', 'Rehabilitation start date', { type: 'date' })}
              {field('clinicianName', 'Clinician / physiotherapist')}
              {field('clinicianContact', 'Clinician contact', { hint: 'Email or phone number.' })}
              <Field label="Rehabilitation goals" htmlFor="p-goals" error={errors.goals} span={2} hint={`${draft.goals.length}/1000`}>
                <textarea id="p-goals" rows={3} value={draft.goals} onChange={(e) => set('goals', e.target.value)} aria-invalid={!!errors.goals} />
              </Field>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!dirty}
                onClick={() => {
                  setDraft(profile);
                  setErrors({});
                }}
              >
                Discard changes
              </button>
              <button type="submit" className="btn btn-primary" disabled={!dirty}>
                <Save size={16} /> Save profile
              </button>
            </div>
          </form>
        </Card>

        <div className="stack">
          <Card title="Summary" icon={<ClipboardList size={18} />}>
            <div className="profile-summary">
              <div className="avatar" aria-hidden>
                {initials}
              </div>
              <div>
                <h3>{profile.fullName || 'No name saved'}</h3>
                <p className="muted">
                  {[age !== null ? `${age} years` : null, profile.patientId ? `ID ${profile.patientId}` : null].filter(Boolean).join(' · ') || 'Complete the form to build the profile.'}
                </p>
              </div>
            </div>
            <dl className="kv">
              <div>
                <dt>Condition</dt>
                <dd>{profile.condition || '—'}</dd>
              </div>
              <div>
                <dt>Affected side</dt>
                <dd style={{ textTransform: 'capitalize' }}>{profile.affectedSide || '—'}</dd>
              </div>
              <div>
                <dt>Weight-bearing</dt>
                <dd>{profile.weightBearingStatus || '—'}</dd>
              </div>
              <div>
                <dt>Rehab started</dt>
                <dd>{profile.rehabStartDate ? fmtDate(profile.rehabStartDate) : '—'}</dd>
              </div>
              <div>
                <dt>Load limit</dt>
                <dd>
                  {fmtLoad(thresholds.maxLoadKg, settings.loadUnit)}
                  {weight > 0 && <span className="muted"> · {Math.round((thresholds.maxLoadKg / weight) * 100)}% of body weight</span>}
                </dd>
              </div>
              <div>
                <dt>Clinician</dt>
                <dd>{[profile.clinicianName, profile.clinicianContact].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
            </dl>
            {profile.goals && (
              <div className="goals">
                <strong>Goals</strong>
                <p>{profile.goals}</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card title="Rehabilitation notes" icon={<NotebookPen size={18} />} id="notes">
        <form className="note-form" onSubmit={submitNote} noValidate>
          <div className="form-grid">
            <Field label="Author" htmlFor="n-author" hint="Optional, e.g. physiotherapist name.">
              <input id="n-author" value={noteAuthor} onChange={(e) => setNoteAuthor(e.target.value)} maxLength={60} />
            </Field>
            <Field label="Note" htmlFor="n-text" error={noteError} required span={2}>
              <textarea
                id="n-text"
                rows={3}
                value={noteText}
                onChange={(e) => {
                  setNoteText(e.target.value);
                  if (noteError) setNoteError('');
                }}
                placeholder="Progress, observations, exercises, next steps…"
                aria-invalid={!!noteError}
              />
            </Field>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              <Plus size={16} /> Add note
            </button>
          </div>
        </form>
        {notes.length > 0 ? (
          <ul className="notes">
            {notes.map((n) => (
              <li key={n.id}>
                <div className="note-meta">
                  <strong>{n.author}</strong>
                  <time dateTime={n.createdAt}>{fmtDateTime(n.createdAt)}</time>
                  <button className="icon-btn danger" onClick={() => setNoteToDelete(n)} aria-label="Delete note">
                    <Trash2 size={15} />
                  </button>
                </div>
                <p>{n.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<NotebookPen size={28} />} title="No notes yet">
            Notes you add appear here, newest first.
          </EmptyState>
        )}
      </Card>

      <ConfirmDialog
        open={noteToDelete !== null}
        title="Delete this note?"
        confirmLabel="Delete note"
        tone="danger"
        onCancel={() => setNoteToDelete(null)}
        onConfirm={() => {
          if (noteToDelete) {
            deleteNote(noteToDelete.id);
            logActivity('profile', 'Rehabilitation note deleted');
            notify('Note deleted');
          }
          setNoteToDelete(null);
        }}
      >
        <p>This note will be permanently removed from this browser.</p>
      </ConfirmDialog>
    </>
  );
}
