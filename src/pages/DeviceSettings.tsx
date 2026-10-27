import { useState } from 'react';
import {
  Bluetooth,
  CircleCheck,
  CircleX,
  Cpu,
  Database,
  Download,
  FlaskConical,
  Monitor,
  PlugZap,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Usb,
  Volume2,
  Info,
  Unplug,
  FileCode2,
  Cpu as Chip,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { beep, useLive } from '../state/LiveContext';
import { Badge, Card, Field, PageHeader, Segmented, SerialStatusBadge, Toggle } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ThresholdForm, thresholdFormKey } from '../components/ThresholdForm';
import { FIRMWARE_THRESHOLDS, SAMPLE_RATES } from '../lib/defaults';
import { downloadTextFile } from '../lib/csv';
import { fmtDateTime, fmtRelative } from '../lib/format';
import { EXAMPLE_LINE, SERIAL_BAUD_RATE } from '../lib/serialProtocol';
import type { DeviceMode } from '../types';

interface CapabilityReport {
  at: string;
  secureContext: boolean;
  webBluetooth: boolean;
  webSerial: boolean;
}

export function DeviceSettings() {
  const app = useApp();
  const { settings, updateSettings, thresholds, saveThresholds, notify, logActivity } = app;
  const live = useLive();
  const { serial } = live;
  const portOpen = serial.status === 'waiting' || serial.status === 'live';
  const [pendingMode, setPendingMode] = useState<DeviceMode | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [report, setReport] = useState<CapabilityReport | null>(null);

  const applyMode = (mode: DeviceMode) => {
    updateSettings({ mode });
    logActivity('device', mode === 'demo' ? 'Switched to demo mode (simulated data)' : 'Switched to hardware mode (not connected)');
    notify(mode === 'demo' ? 'Demo mode on — readings are simulated' : 'Hardware mode on — no device connected', 'info');
  };

  const requestMode = (mode: DeviceMode) => {
    if (mode === settings.mode) return;
    if (live.recording) setPendingMode(mode);
    else applyMode(mode);
  };

  const checkCapabilities = () => {
    const nav = navigator as Navigator & { bluetooth?: unknown; serial?: unknown };
    setReport({
      at: new Date().toISOString(),
      secureContext: window.isSecureContext,
      webBluetooth: typeof nav.bluetooth !== 'undefined',
      webSerial: typeof nav.serial !== 'undefined',
    });
  };

  const exportBackup = () => {
    const backup = {
      app: 'SmartCrutch+',
      exportedAt: new Date().toISOString(),
      note: 'All session readings in this file are SIMULATED / DEMO DATA.',
      profile: app.profile,
      notes: app.notes,
      thresholds: app.thresholds,
      settings: app.settings,
      contacts: app.contacts,
      sessions: app.sessions,
    };
    downloadTextFile(`smartcrutch-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), 'application/json');
    notify('Backup file downloaded');
  };

  const isDemo = settings.mode === 'demo';

  return (
    <>
      <PageHeader title="Device & Settings" subtitle="Data source, connection, units, display and thresholds." />

      <div className="grid two-col">
        <Card title="Data source" icon={<Cpu size={18} />}>
          <div className="mode-options" role="radiogroup" aria-label="Device mode">
            <button type="button" role="radio" aria-checked={isDemo} className={`mode-option ${isDemo ? 'active' : ''}`} onClick={() => requestMode('demo')}>
              <FlaskConical size={22} aria-hidden />
              <span>
                <strong>Demo mode</strong>
                <small>In-browser simulator. All readings labelled SIMULATED / DEMO DATA.</small>
              </span>
            </button>
            <button type="button" role="radio" aria-checked={!isDemo} className={`mode-option ${!isDemo ? 'active' : ''}`} onClick={() => requestMode('hardware')}>
              <PlugZap size={22} aria-hidden />
              <span>
                <strong>Hardware mode</strong>
                <small>ESP32 over USB serial (Web Serial, {SERIAL_BAUD_RATE} baud). Shows readings only when valid protocol messages arrive.</small>
              </span>
            </button>
          </div>
          {live.recording && <p className="fine">A session is recording. Switching mode will stop and save it first.</p>}
        </Card>

        <Card title="Connection" icon={<PlugZap size={18} />}>
          <dl className="kv">
            <div>
              <dt>Status</dt>
              <dd>
                {isDemo ? (
                  <Badge tone="green" dot>
                    Simulator streaming
                  </Badge>
                ) : (
                  <SerialStatusBadge status={serial.status} />
                )}
              </dd>
            </div>
            <div>
              <dt>Device</dt>
              <dd>{isDemo ? 'Virtual demo crutch' : serial.portLabel ?? 'SmartCrutch+ ESP32 (USB serial)'}</dd>
            </div>
            {!isDemo && (
              <>
                <div>
                  <dt>Port settings</dt>
                  <dd className="mono-sm">{SERIAL_BAUD_RATE} baud · newline-delimited JSON</dd>
                </div>
                <div>
                  <dt>Valid messages</dt>
                  <dd>
                    {serial.validMessages}
                    {serial.lastValidAt && <span className="muted"> · last {fmtRelative(new Date(serial.lastValidAt).toISOString())}</span>}
                  </dd>
                </div>
                <div>
                  <dt>Ignored lines</dt>
                  <dd>{serial.ignoredLines}</dd>
                </div>
              </>
            )}
          </dl>

          {!isDemo && (
            <>
              {serial.status === 'unsupported' && (
                <div className="info-box warn">
                  <Info size={18} aria-hidden />
                  <span>
                    Web Serial is not available here. Use desktop <strong>Chrome or Edge</strong> and open the app on <code>http://localhost</code> or
                    HTTPS. Firefox and Safari do not support it.
                  </span>
                </div>
              )}
              {serial.error && <p className="form-error-banner">{serial.error}</p>}
              {serial.status === 'waiting' && (
                <div className="info-box warn">
                  <Info size={18} aria-hidden />
                  <span>
                    The port is open but {serial.validMessages > 0 ? 'valid data has stopped arriving' : 'no valid SmartCrutch+ message has arrived yet'}. An
                    open port does not mean readings are available — the ESP32 must run firmware that prints the protocol below.
                  </span>
                </div>
              )}
              {serial.lastRawLine && portOpen && (
                <div className="raw-box">
                  <span className="field-hint">Last line received</span>
                  <code className="raw-line">{serial.lastRawLine}</code>
                </div>
              )}
              <div className="form-actions start">
                {portOpen ? (
                  <button className="btn btn-ghost" onClick={() => void live.disconnectHardware()}>
                    <Unplug size={16} /> Disconnect
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => void live.connectHardware()}
                    disabled={serial.status === 'connecting' || serial.status === 'unsupported'}
                  >
                    <PlugZap size={16} /> {serial.status === 'connecting' ? 'Connecting…' : 'Connect Hardware'}
                  </button>
                )}
                <button className="btn btn-ghost" onClick={checkCapabilities}>
                  <RefreshCw size={16} /> Check browser capabilities
                </button>
              </div>
            </>
          )}
          {isDemo && (
            <div className="form-actions start">
              <button className="btn btn-ghost" onClick={checkCapabilities}>
                <RefreshCw size={16} /> Check browser capabilities
              </button>
            </div>
          )}
          {report && (
            <ul className="capability-list" aria-live="polite">
              <Capability ok={report.secureContext} icon={<Monitor size={16} />} label="Secure context (HTTPS or localhost)" />
              <Capability ok={report.webBluetooth} icon={<Bluetooth size={16} />} label="Web Bluetooth API available" />
              <Capability ok={report.webSerial} icon={<Usb size={16} />} label="Web Serial API available" />
              <li className="fine">
                Checked {fmtDateTime(report.at)}. This only reports what this browser supports — it does not search for or connect to any device. Only
                Web Serial is used by SmartCrutch+.
              </li>
            </ul>
          )}
        </Card>
      </div>

      <div className="grid two-col">
        <Card title="Units & data" icon={<SlidersHorizontal size={18} />}>
          <div className="settings-rows">
            <div className="setting-row">
              <div>
                <div className="toggle-label">Load unit</div>
                <p className="field-hint">Display unit. The firmware reports grams.</p>
              </div>
              <Segmented
                ariaLabel="Load unit"
                value={settings.loadUnit}
                onChange={(v) => {
                  updateSettings({ loadUnit: v });
                  notify(`Load unit set to ${v}`, 'info');
                }}
                options={[
                  { value: 'g', label: 'g' },
                  { value: 'kg', label: 'kg' },
                  { value: 'lb', label: 'lb' },
                ]}
              />
            </div>
            <div className="setting-row">
              <div>
                <div className="toggle-label">Angle unit</div>
                <p className="field-hint">Degrees from vertical.</p>
              </div>
              <Badge tone="gray">degrees (°)</Badge>
            </div>
            <div className="setting-row">
              <Field label="Demo sample rate" htmlFor="s-rate" hint="How often the simulator produces a reading.">
                <select id="s-rate" value={settings.sampleRateHz} onChange={(e) => updateSettings({ sampleRateHz: Number(e.target.value) })} disabled={!isDemo}>
                  {SAMPLE_RATES.map((r) => (
                    <option key={r} value={r}>
                      {r} Hz
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Display & alerts" icon={<Monitor size={18} />}>
          <div className="settings-rows">
            <div className="setting-row">
              <div>
                <div className="toggle-label">Theme</div>
                <p className="field-hint">“System” follows your device setting.</p>
              </div>
              <Segmented
                ariaLabel="Theme"
                value={settings.theme}
                onChange={(v) => updateSettings({ theme: v })}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'system', label: 'System' },
                ]}
              />
            </div>
            <Toggle id="s-compact" label="Compact layout" description="Tighter spacing to fit more on screen." checked={settings.compactLayout} onChange={(v) => updateSettings({ compactLayout: v })} />
            <Toggle
              id="s-sound"
              label="Audible alerts"
              description="Short tone when load exceeds the limit or tilt exceeds the maximum (demo or hardware data)."
              checked={settings.audibleAlerts}
              onChange={(v) => {
                updateSettings({ audibleAlerts: v });
                if (v) beep();
              }}
            />
            <div className="form-actions start">
              <button className="btn btn-ghost btn-sm" onClick={beep}>
                <Volume2 size={14} /> Play test tone
              </button>
            </div>
          </div>
        </Card>
      </div>

      <Card
        title="Safety thresholds"
        icon={<SlidersHorizontal size={18} />}
        actions={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              saveThresholds(FIRMWARE_THRESHOLDS);
              notify('Thresholds set to match the firmware: 800 g load, 20° tilt');
            }}
          >
            <Chip size={14} /> Match firmware (800 g, 20°)
          </button>
        }
      >
        <ThresholdForm key={thresholdFormKey(thresholds, settings.loadUnit)} idPrefix="settings" />
        <p className="fine">
          The app’s thresholds are applied to readings in the browser. The firmware also sends its own <code>unsafe</code> flag (800 g / 20° in the
          current sketch), shown separately on Live Monitoring.
        </p>
      </Card>

      <Card title="ESP32 serial protocol & firmware" icon={<FileCode2 size={18} />}>
        <p className="muted">
          The app reads one JSON object per line at {SERIAL_BAUD_RATE} baud. Lines that do not match exactly are ignored and counted, so startup messages
          are harmless. <strong>The current firmware only prints startup messages, so no readings will appear until it is updated.</strong>
        </p>
        <pre className="code-block">{EXAMPLE_LINE}</pre>
        <dl className="kv">
          <div>
            <dt>
              <code>type</code>
            </dt>
            <dd>must be exactly "smartcrutch"</dd>
          </div>
          <div>
            <dt>
              <code>weight_g</code>
            </dt>
            <dd>number, grams (firmware: HX711 read() ÷ 230)</dd>
          </div>
          <div>
            <dt>
              <code>angle_deg</code>
            </dt>
            <dd>number −180…180 (firmware: atan2(y, z) × 180/π)</dd>
          </div>
          <div>
            <dt>
              <code>unsafe</code>
            </dt>
            <dd>true / false — the firmware’s own decision</dd>
          </div>
        </dl>
        <p className="fine">
          Updated firmware for review: <code>firmware/SmartCrutchPlus_SerialJSON/SmartCrutchPlus_SerialJSON.ino</code> in the project folder (upload steps in{' '}
          <code>firmware/README.md</code>). Close the Arduino Serial Monitor before connecting — only one program can use the port at a time.
        </p>
      </Card>

      <Card title="Data & privacy" icon={<Database size={18} />}>
        <p className="muted">
          Everything — profile, notes, contacts, thresholds, settings and sessions — is stored in this browser’s localStorage. Nothing is uploaded.
        </p>
        <div className="form-actions start">
          <button className="btn btn-ghost" onClick={exportBackup}>
            <Download size={16} /> Download backup (JSON)
          </button>
          <button className="btn btn-danger-ghost" onClick={() => setConfirmReset(true)}>
            <Trash2 size={16} /> Reset all local data
          </button>
        </div>
        <p className="fine">SmartCrutch+ v1.0 · Student prototype · Not a medically validated device.</p>
      </Card>

      <ConfirmDialog
        open={pendingMode !== null}
        title="Stop the current session?"
        confirmLabel="Stop, save and switch"
        onCancel={() => setPendingMode(null)}
        onConfirm={() => {
          live.stopSession();
          if (pendingMode) applyMode(pendingMode);
          setPendingMode(null);
        }}
      >
        <p>A simulated session is being recorded. It will be stopped and saved to Session History before switching to {pendingMode === 'hardware' ? 'hardware' : 'demo'} mode.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmReset}
        title="Reset all local data?"
        confirmLabel="Erase everything"
        tone="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          if (live.recording) live.stopSession();
          app.resetAllData();
          setConfirmReset(false);
          setReport(null);
          notify('All local data erased. Defaults restored.');
        }}
      >
        <p>This permanently deletes the patient profile, notes, emergency contacts, saved sessions, thresholds and settings from this browser.</p>
        <p>Consider downloading a backup first.</p>
      </ConfirmDialog>
    </>
  );
}

function Capability({ ok, icon, label }: { ok: boolean; icon: React.ReactNode; label: string }) {
  return (
    <li className={ok ? 'cap-ok' : 'cap-no'}>
      {icon}
      <span>{label}</span>
      {ok ? (
        <span className="zone-text zone-safe">
          <CircleCheck size={15} aria-hidden /> Yes
        </span>
      ) : (
        <span className="zone-text muted">
          <CircleX size={15} aria-hidden /> No
        </span>
      )}
    </li>
  );
}
