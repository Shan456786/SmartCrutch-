import { useState, type FormEvent } from 'react';
import {
  BookOpen,
  CircleCheck,
  OctagonAlert,
  Pencil,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Star,
  Trash2,
  TriangleAlert,
  Users,
  X,
  Info,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { SERIAL_STATUS_LABEL, useLive } from '../state/LiveContext';
import { Badge, Card, EmptyState, Field, PageHeader } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ThresholdForm, thresholdFormKey } from '../components/ThresholdForm';
import { fmtDateTime, fmtLoad, uid } from '../lib/format';
import type { EmergencyContact } from '../types';

const EMPTY_CONTACT = { name: '', relationship: '', phone: '', primary: false };
type ContactDraft = typeof EMPTY_CONTACT;

function validateContact(c: ContactDraft): Partial<Record<keyof ContactDraft, string>> {
  const e: Partial<Record<keyof ContactDraft, string>> = {};
  if (c.name.trim().length < 2) e.name = 'Enter the contact’s name (at least 2 characters).';
  const digits = c.phone.replace(/\D/g, '');
  if (!c.phone.trim()) e.phone = 'Enter a phone number.';
  else if (!/^\+?[\d\s().-]+$/.test(c.phone.trim())) e.phone = 'Use digits, spaces, brackets, dashes and an optional leading +.';
  else if (digits.length < 6 || digits.length > 15) e.phone = 'Phone numbers should have 6–15 digits.';
  return e;
}

export function SafetyCentre() {
  const { thresholds, settings, contacts, saveContact, deleteContact, notify, logActivity } = useApp();
  const live = useLive();
  const unit = settings.loadUnit;

  // Contacts
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [cDraft, setCDraft] = useState<ContactDraft>(EMPTY_CONTACT);
  const [cErrors, setCErrors] = useState<Partial<Record<keyof ContactDraft, string>>>({});
  const [toDelete, setToDelete] = useState<EmergencyContact | null>(null);

  const startEdit = (c?: EmergencyContact) => {
    setEditing(c ? c.id : 'new');
    setCDraft(c ? { name: c.name, relationship: c.relationship, phone: c.phone, primary: c.primary } : { ...EMPTY_CONTACT, primary: contacts.length === 0 });
    setCErrors({});
  };
  const submitContact = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateContact(cDraft);
    setCErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const id = editing && editing !== 'new' ? editing : uid();
    saveContact({ id, name: cDraft.name.trim(), relationship: cDraft.relationship.trim(), phone: cDraft.phone.trim(), primary: cDraft.primary });
    logActivity('safety', `Emergency contact ${editing === 'new' ? 'added' : 'updated'}: ${cDraft.name.trim()}`);
    notify(editing === 'new' ? 'Emergency contact added' : 'Emergency contact updated');
    setEditing(null);
  };

  // Emergency action
  const [confirmEmergency, setConfirmEmergency] = useState(false);
  const [emergencyAt, setEmergencyAt] = useState<string | null>(null);
  const sortedContacts = [...contacts].sort((a, b) => Number(b.primary) - Number(a.primary));

  const src = live.isSimulated ? 'simulated' : 'hardware';
  const warnings: { tone: 'red' | 'amber' | 'gray'; text: string }[] = [];
  if (live.streaming && live.zone === 'over') warnings.push({ tone: 'red', text: `Load is above the ${fmtLoad(thresholds.maxLoadKg, unit)} limit (${src}).` });
  else if (live.streaming && live.zone === 'caution') warnings.push({ tone: 'amber', text: `Load is approaching the limit (≥ ${thresholds.warnPercent}%, ${src}).` });
  if (live.streaming && live.tiltAlert) warnings.push({ tone: 'red', text: `Crutch angle exceeds ±${thresholds.maxTiltDeg}° (${src}).` });
  if (!live.isSimulated && live.serial.status === 'live' && live.serial.deviceUnsafe)
    warnings.push({ tone: 'red', text: 'The ESP32 firmware reports UNSAFE (its own 800 g / 20° check).' });
  if (contacts.length === 0) warnings.push({ tone: 'amber', text: 'No emergency contact configured.' });
  if (settings.mode === 'hardware' && live.serial.status !== 'live')
    warnings.push({ tone: 'gray', text: `Hardware mode: ${SERIAL_STATUS_LABEL[live.serial.status]} — no live safety monitoring.` });
  warnings.push({ tone: 'gray', text: 'Fall detection is unverified and not available on hardware.' });

  return (
    <>
      <PageHeader
        title="Safety Centre"
        subtitle="Thresholds, warnings, emergency contacts and guidance."
        actions={
          <button className="btn btn-emergency" onClick={() => setConfirmEmergency(true)}>
            <Siren size={18} /> Emergency help
          </button>
        }
      />

      {emergencyAt && (
        <section className="card emergency-panel" role="region" aria-label="Emergency contacts">
          <div className="card-head">
            <h2 className="card-title">
              <Siren size={18} /> Emergency help — call someone now
            </h2>
            <button className="icon-btn" onClick={() => setEmergencyAt(null)} aria-label="Close emergency panel">
              <X size={18} />
            </button>
          </div>
          <p>
            <strong>SmartCrutch+ has not called or messaged anyone.</strong> Use your phone to contact someone. In a medical emergency, call your local
            emergency number (for example 112, 911 or 999) first.
          </p>
          {sortedContacts.length > 0 ? (
            <ul className="contact-list">
              {sortedContacts.map((c) => (
                <li key={c.id}>
                  <div>
                    <strong>{c.name}</strong> {c.primary && <Badge tone="teal">Primary</Badge>}
                    <div className="muted">{c.relationship || 'Contact'}</div>
                  </div>
                  <div className="contact-phone">
                    <span className="phone-text">{c.phone}</span>
                    <a className="btn btn-primary btn-sm" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>
                      <Phone size={14} /> Call
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No emergency contacts are configured. Add one below so it appears here.</p>
          )}
          <p className="fine">Opened {fmtDateTime(emergencyAt)}. The “Call” button only opens your device’s dialler if it supports it; you must place the call yourself.</p>
        </section>
      )}

      <div className="grid two-col">
        <Card title="Safety thresholds" icon={<SlidersHorizontal size={18} />} id="thresholds">
          <ThresholdForm key={thresholdFormKey(thresholds, unit)} idPrefix="safety" />
        </Card>

        <Card title="Current warnings" icon={<TriangleAlert size={18} />}>
          <ul className="warning-list">
            {warnings.map((w, i) => (
              <li key={i} className={`warn-${w.tone}`}>
                {w.tone === 'red' ? <OctagonAlert size={18} aria-hidden /> : w.tone === 'amber' ? <TriangleAlert size={18} aria-hidden /> : <Info size={18} aria-hidden />}
                <span>{w.text}</span>
              </li>
            ))}
            {live.streaming && live.zone === 'safe' && !live.tiltAlert && (
              <li className="warn-green">
                <CircleCheck size={18} aria-hidden />
                <span>{live.isSimulated ? 'Simulated' : 'Hardware'} load and angle are within the configured limits.</span>
              </li>
            )}
          </ul>
        </Card>
      </div>

      <div className="grid two-col">
        <Card
          title="Emergency contacts"
          icon={<Users size={18} />}
          actions={
            editing === null && (
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit()}>
                <Plus size={14} /> Add contact
              </button>
            )
          }
        >
          {editing !== null && (
            <form className="contact-form" onSubmit={submitContact} noValidate>
              <h3>{editing === 'new' ? 'New emergency contact' : 'Edit emergency contact'}</h3>
              <div className="form-grid">
                <Field label="Name" htmlFor="c-name" error={cErrors.name} required>
                  <input id="c-name" value={cDraft.name} onChange={(e) => setCDraft({ ...cDraft, name: e.target.value })} aria-invalid={!!cErrors.name} autoComplete="name" />
                </Field>
                <Field label="Relationship" htmlFor="c-rel" hint="e.g. Parent, Carer, Physiotherapist">
                  <input id="c-rel" value={cDraft.relationship} onChange={(e) => setCDraft({ ...cDraft, relationship: e.target.value })} />
                </Field>
                <Field label="Phone number" htmlFor="c-phone" error={cErrors.phone} required>
                  <input id="c-phone" type="tel" value={cDraft.phone} onChange={(e) => setCDraft({ ...cDraft, phone: e.target.value })} aria-invalid={!!cErrors.phone} autoComplete="tel" />
                </Field>
                <div className="field checkbox-field">
                  <label>
                    <input type="checkbox" checked={cDraft.primary} onChange={(e) => setCDraft({ ...cDraft, primary: e.target.checked })} /> Primary contact
                  </label>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Save size={16} /> Save contact
                </button>
              </div>
            </form>
          )}
          {contacts.length > 0 ? (
            <ul className="contact-list">
              {sortedContacts.map((c) => (
                <li key={c.id}>
                  <div>
                    <strong>{c.name}</strong> {c.primary && <Badge tone="teal"><Star size={11} /> Primary</Badge>}
                    <div className="muted">
                      {c.relationship || 'Contact'} · {c.phone}
                    </div>
                  </div>
                  <div className="row">
                    <button className="icon-btn" onClick={() => startEdit(c)} aria-label={`Edit ${c.name}`}>
                      <Pencil size={16} />
                    </button>
                    <button className="icon-btn danger" onClick={() => setToDelete(c)} aria-label={`Delete ${c.name}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            editing === null && (
              <EmptyState
                icon={<Users size={28} />}
                title="No emergency contacts"
                action={
                  <button className="btn btn-primary btn-sm" onClick={() => startEdit()}>
                    <Plus size={14} /> Add contact
                  </button>
                }
              >
                Add someone who can help. Contacts are stored only in this browser and are never contacted automatically.
              </EmptyState>
            )
          )}
        </Card>

        <Card title="Safety guidance" icon={<BookOpen size={18} />}>
          <ul className="guidance">
            <li>Follow the weight-bearing instructions from your clinician — they take priority over anything shown in this app.</li>
            <li>If you feel pain, dizziness or instability, stop, sit down safely and rest before continuing.</li>
            <li>Check crutch tips, height and hand grips before each walk; replace worn rubber tips.</li>
            <li>Clear walking paths of rugs, cables and wet surfaces. Take extra care on stairs and slopes.</li>
            <li>Keep a phone within reach while practising, and tell someone when you are exercising alone.</li>
            <li>
              <strong>SmartCrutch+ is a student prototype.</strong> It is not a medical device, its alerts may be wrong, and it cannot detect falls or summon help.
            </li>
          </ul>
          <div className="info-box">
            <ShieldCheck size={18} aria-hidden />
            <span>The Emergency help button only shows your contacts after you confirm. It never calls or messages anyone by itself.</span>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmEmergency}
        title="Open emergency help?"
        confirmLabel="Yes, show emergency contacts"
        tone="danger"
        onCancel={() => setConfirmEmergency(false)}
        onConfirm={() => {
          setConfirmEmergency(false);
          const at = new Date().toISOString();
          setEmergencyAt(at);
          logActivity('emergency', 'Emergency help panel opened (no one was contacted automatically)');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      >
        <p>This will display your emergency contacts with buttons you can use to call them yourself.</p>
        <p>
          <strong>SmartCrutch+ will not call or message anyone automatically.</strong> In a medical emergency, contact your local emergency services directly.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete emergency contact?"
        confirmLabel="Delete contact"
        tone="danger"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            deleteContact(toDelete.id);
            logActivity('safety', `Emergency contact removed: ${toDelete.name}`);
            notify('Emergency contact deleted');
          }
          setToDelete(null);
        }}
      >
        <p>
          {toDelete?.name} ({toDelete?.phone}) will be removed from this browser.
        </p>
      </ConfirmDialog>
    </>
  );
}
