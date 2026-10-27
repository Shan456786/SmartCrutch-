import {
  Activity,
  CircleCheck,
  Clock,
  Download,
  Footprints,
  Gauge,
  History,
  OctagonAlert,
  Play,
  ShieldCheck,
  Square,
  TriangleAlert,
  UserRound,
  Cpu,
  ChevronRight,
  Users,
  Compass,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useLive } from '../state/LiveContext';
import { Badge, Card, EmptyState, NotConnected, PageHeader, SerialStatusBadge, SourceTag, Stat } from '../components/ui';
import { BarChart } from '../components/charts';
import { fmtDateTime, fmtDuration, fmtDurationWords, fmtLoad, fmtRelative, toUnit, unitDigits, zoneLabel } from '../lib/format';
import { href, navigate } from '../lib/router';
import { downloadTextFile, sessionsToCSV } from '../lib/csv';
import type { ActivityKind, LoadZone } from '../types';

const ZONE_ICON: Record<LoadZone, typeof CircleCheck> = { safe: CircleCheck, caution: TriangleAlert, over: OctagonAlert };
const ACTIVITY_TONE: Record<ActivityKind, 'teal' | 'navy' | 'amber' | 'red' | 'gray' | 'green'> = {
  session: 'teal',
  safety: 'amber',
  profile: 'navy',
  settings: 'gray',
  device: 'gray',
  emergency: 'red',
};

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Dashboard() {
  const { profile, sessions, thresholds, settings, activity, contacts, notify, logActivity } = useApp();
  const live = useLive();
  const unit = settings.loadUnit;
  const digits = unitDigits(unit);
  const isDemo = settings.mode === 'demo';

  const weekAgo = Date.now() - 7 * 86400000;
  const week = sessions.filter((s) => new Date(s.startedAt).getTime() >= weekAgo);
  const weekTime = week.reduce((a, s) => a + s.durationSec, 0);
  const weekOver = week.reduce((a, s) => a + s.overloadEvents, 0);
  const last = sessions[0];
  const recent = sessions.slice(0, 10).reverse();
  const firstName = profile.fullName.trim().split(/\s+/)[0];
  const ZoneIcon = ZONE_ICON[live.zone];

  const exportCSV = () => {
    if (sessions.length === 0) {
      notify('No saved sessions to export yet. Record a session first.', 'info');
      return;
    }
    downloadTextFile(`smartcrutch-sessions-${new Date().toISOString().slice(0, 10)}.csv`, sessionsToCSV(sessions, unit));
    logActivity('session', `Exported ${sessions.length} session(s) to CSV`);
    notify('CSV export downloaded');
  };

  return (
    <>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          live.recording ? (
            <button className="btn btn-danger" onClick={() => live.stopSession()}>
              <Square size={16} /> Stop &amp; save session
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => live.startSession() && navigate('live')}
              disabled={!live.canRecord}
              title={live.canRecord ? undefined : 'Recording needs live hardware data'}
            >
              <Play size={16} /> Start session
            </button>
          )
        }
      />

      <div className="grid stats-grid">
        <div className={`card stat-card zone-${live.streaming ? live.zone : 'none'}`}>
          {live.streaming && live.latest ? (
            <>
              <Stat
                label="Current crutch load"
                icon={<Gauge size={16} />}
                value={toUnit(live.latest.loadKg, unit).toFixed(digits)}
                unit={unit}
                tone={live.zone === 'over' ? 'over' : live.zone === 'caution' ? 'caution' : 'default'}
                hint={
                  <span className={`zone-text zone-${live.zone}`}>
                    <ZoneIcon size={14} aria-hidden /> {zoneLabel[live.zone]}
                  </span>
                }
              />
              <SourceTag simulated={isDemo} />
            </>
          ) : (
            <div className="stat">
              <div className="stat-label">
                <Gauge size={16} /> Current crutch load
              </div>
              <NotConnected compact status={live.serial.status} />
            </div>
          )}
        </div>
        <div className="card stat-card">
          <Stat label="Sessions (7 days)" icon={<History size={16} />} value={week.length} hint={`${sessions.length} saved in total`} />
        </div>
        <div className="card stat-card">
          <Stat label="Recorded time (7 days)" icon={<Clock size={16} />} value={fmtDurationWords(weekTime)} hint="Across all saved sessions" />
        </div>
        <div className="card stat-card">
          <Stat
            label="Over-limit events (7 days)"
            icon={<TriangleAlert size={16} />}
            value={weekOver}
            tone={weekOver > 0 ? 'caution' : 'ok'}
            hint={`Limit ${fmtLoad(thresholds.maxLoadKg, unit, 0)}`}
          />
        </div>
      </div>

      <div className="grid two-col">
        <Card title={live.recording ? 'Current session' : 'Most recent session'} icon={<Activity size={18} />} actions={<a className="link" href={href('live')}>Live view <ChevronRight size={14} /></a>}>
          {live.recording && live.session ? (
            <div className="session-now">
              <div className="session-timer">
                <span className="rec-dot" aria-hidden /> Recording
                <strong>{fmtDuration(live.session.elapsedSec)}</strong>
              </div>
              <div className="mini-stats">
                <Stat label="Peak load" value={toUnit(live.session.peakLoadKg, unit).toFixed(digits)} unit={unit} />
                <Stat label="Over-limit" value={live.session.overloadEvents} tone={live.session.overloadEvents ? 'over' : 'default'} />
                <Stat label="Tilt events" value={live.session.tiltEvents} />
                <Stat label="Est. strikes" value={live.session.strikes} />
              </div>
              <div className="row gap">
                <SourceTag simulated={isDemo} />
                <button className="btn btn-danger btn-sm" onClick={() => live.stopSession()}>
                  <Square size={14} /> Stop &amp; save
                </button>
              </div>
            </div>
          ) : last ? (
            <div className="session-now">
              <p className="muted">
                {fmtDateTime(last.startedAt)} · {fmtDurationWords(last.durationSec)}
              </p>
              <div className="mini-stats">
                <Stat label="Avg load" value={toUnit(last.avgLoadKg, unit).toFixed(digits)} unit={unit} />
                <Stat label="Peak load" value={toUnit(last.peakLoadKg, unit).toFixed(digits)} unit={unit} tone={last.peakLoadKg > last.thresholds.maxLoadKg ? 'over' : 'default'} />
                <Stat label="Over-limit" value={last.overloadEvents} />
                <Stat label="Est. strikes" value={last.estimatedStrikes} />
              </div>
              <div className="row gap">
                <SourceTag simulated={last.source === 'demo'} />
                <a className="btn btn-ghost btn-sm" href={href('history')}>
                  All sessions
                </a>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Footprints size={28} />}
              title="No sessions yet"
              action={
                live.canRecord ? (
                  <button className="btn btn-primary btn-sm" onClick={() => live.startSession() && navigate('live')}>
                    <Play size={14} /> {isDemo ? 'Start a demo session' : 'Start a hardware session'}
                  </button>
                ) : (
                  <a className="btn btn-ghost btn-sm" href={href('settings')}>
                    Device settings
                  </a>
                )
              }
            >
              {isDemo
                ? 'Start a session to record simulated load and angle data.'
                : live.canRecord
                  ? 'Live hardware data is arriving — start a session to record it.'
                  : 'No live hardware data is arriving yet, so sessions cannot be recorded.'}
            </EmptyState>
          )}
        </Card>

        <Card title="Device status" icon={<Cpu size={18} />} actions={<a className="link" href={href('settings')}>Settings <ChevronRight size={14} /></a>}>
          <dl className="kv">
            <div>
              <dt>Mode</dt>
              <dd>{isDemo ? <Badge tone="teal">Demo (simulated)</Badge> : <Badge tone="navy">Hardware</Badge>}</dd>
            </div>
            <div>
              <dt>Connection</dt>
              <dd>
                {isDemo ? (
                  <Badge tone="green" dot>
                    Simulator streaming
                  </Badge>
                ) : (
                  <SerialStatusBadge status={live.serial.status} />
                )}
              </dd>
            </div>
            <div>
              <dt>Data source</dt>
              <dd>{isDemo ? 'In-browser simulator' : 'ESP32 via USB serial (JSON v1)'}</dd>
            </div>
            <div>
              <dt>{isDemo ? 'Sample rate' : 'Valid messages'}</dt>
              <dd>{isDemo ? `${settings.sampleRateHz} Hz (simulated)` : `${live.serial.validMessages} received`}</dd>
            </div>
            <div>
              <dt>Crutch angle</dt>
              <dd>
                {live.streaming && live.latest ? (
                  <span className={live.tiltAlert ? 'zone-text zone-over' : ''}>
                    <Compass size={14} aria-hidden /> {live.latest.angleDeg.toFixed(1)}°{live.tiltAlert ? ' · tilt alert' : ''}
                  </span>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid two-col">
        <Card title="Safety summary" icon={<ShieldCheck size={18} />} actions={<a className="link" href={href('safety')}>Safety Centre <ChevronRight size={14} /></a>}>
          <ul className="check-list">
            <li>
              <span className="label">Max load limit</span>
              <strong>{fmtLoad(thresholds.maxLoadKg, unit)}</strong>
            </li>
            <li>
              <span className="label">Warning from</span>
              <strong>
                {thresholds.warnPercent}% ({fmtLoad((thresholds.maxLoadKg * thresholds.warnPercent) / 100, unit)})
              </strong>
            </li>
            <li>
              <span className="label">Max tilt angle</span>
              <strong>{thresholds.maxTiltDeg}°</strong>
            </li>
            <li>
              <span className="label">Emergency contacts</span>
              {contacts.length > 0 ? (
                <Badge tone="green">{contacts.length} configured</Badge>
              ) : (
                <a href={href('safety')} className="badge badge-amber">
                  <Users size={12} /> None — add one
                </a>
              )}
            </li>
            <li>
              <span className="label">Fall detection</span>
              <Badge tone="gray">Unverified — not available</Badge>
            </li>
          </ul>
          <p className="fine">Example thresholds only. Ask a clinician to set limits appropriate for the patient.</p>
        </Card>

        <Card title="Quick actions" icon={<Activity size={18} />}>
          <div className="quick-actions">
            {live.recording ? (
              <button className="qa" onClick={() => live.stopSession()}>
                <Square size={20} />
                <span>Stop &amp; save session</span>
              </button>
            ) : (
              <button className="qa" onClick={() => live.startSession() && navigate('live')} disabled={!live.canRecord}>
                <Play size={20} />
                <span>{isDemo ? 'Start demo session' : live.canRecord ? 'Start hardware session' : 'Start session (needs live data)'}</span>
              </button>
            )}
            <a className="qa" href={href('live')}>
              <Activity size={20} />
              <span>Open live monitoring</span>
            </a>
            <a className="qa" href={href('safety')}>
              <ShieldCheck size={20} />
              <span>Adjust thresholds</span>
            </a>
            <button className="qa" onClick={exportCSV}>
              <Download size={20} />
              <span>Export sessions (CSV)</span>
            </button>
            <a className="qa" href={href('profile')}>
              <UserRound size={20} />
              <span>Patient profile</span>
            </a>
            <a className="qa" href={href('history')}>
              <History size={20} />
              <span>Session history</span>
            </a>
          </div>
        </Card>
      </div>

      <div className="grid two-col">
        <Card title="Peak load — recent sessions" icon={<Gauge size={18} />}>
          {recent.length > 0 ? (
            <>
              <BarChart
                ariaLabel="Peak load per recent session"
                items={recent.map((s) => ({
                  key: s.id,
                  label: new Date(s.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
                  value: toUnit(s.peakLoadKg, unit),
                  over: s.peakLoadKg > s.thresholds.maxLoadKg,
                  detail: fmtDateTime(s.startedAt),
                }))}
                refValue={toUnit(thresholds.maxLoadKg, unit)}
                refLabel="Current limit"
                formatY={(v) => `${Math.round(v)}`}
              />
              <p className="fine">
                Peak load in {unit} for the last {recent.length} session(s). Bars above the limit are highlighted. Each session’s data source (simulated or
                ESP32) is shown in Session History.
              </p>
            </>
          ) : (
            <EmptyState icon={<Gauge size={28} />} title="Nothing to chart yet">
              Saved sessions will appear here.
            </EmptyState>
          )}
        </Card>

        <Card title="Recent activity" icon={<Clock size={18} />}>
          {activity.length > 0 ? (
            <ul className="activity">
              {activity.slice(0, 7).map((a) => (
                <li key={a.id}>
                  <Badge tone={ACTIVITY_TONE[a.kind]} dot>
                    {a.kind}
                  </Badge>
                  <span className="activity-msg">{a.message}</span>
                  <time dateTime={a.at} title={fmtDateTime(a.at)}>
                    {fmtRelative(a.at)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Clock size={28} />} title="No activity yet">
              Sessions, threshold changes and profile updates will be listed here.
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
