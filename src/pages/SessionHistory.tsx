import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Download, FlaskConical, Gauge, History, Play, Trash2, TriangleAlert } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useLive } from '../state/LiveContext';
import { Badge, Card, EmptyState, PageHeader, SourceTag, Stat } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Sparkline } from '../components/charts';
import { downloadTextFile, sessionsToCSV } from '../lib/csv';
import { fmtDateTime, fmtDuration, fmtDurationWords, fmtLoad, toUnit, unitDigits } from '../lib/format';
import { generateDemoSession } from '../lib/sessionStats';
import { navigate } from '../lib/router';
import type { LoadUnit, SessionRecord } from '../types';

type SortKey = 'newest' | 'oldest' | 'longest' | 'peak';

export function SessionHistory() {
  const { sessions, settings, thresholds, deleteSession, clearSessions, addSessions, notify, logActivity } = useApp();
  const live = useLive();
  const unit = settings.loadUnit;
  const [sort, setSort] = useState<SortKey>('newest');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SessionRecord | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const sorted = useMemo(() => {
    const list = [...sessions];
    switch (sort) {
      case 'oldest':
        return list.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      case 'longest':
        return list.sort((a, b) => b.durationSec - a.durationSec);
      case 'peak':
        return list.sort((a, b) => b.peakLoadKg - a.peakLoadKg);
      default:
        return list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    }
  }, [sessions, sort]);

  const totals = useMemo(() => {
    const n = sessions.length;
    const time = sessions.reduce((a, s) => a + s.durationSec, 0);
    return {
      n,
      time,
      avgDuration: n ? time / n : 0,
      avgPeak: n ? sessions.reduce((a, s) => a + s.peakLoadKg, 0) / n : 0,
      over: sessions.reduce((a, s) => a + s.overloadEvents, 0),
      strikes: sessions.reduce((a, s) => a + s.estimatedStrikes, 0),
    };
  }, [sessions]);

  const exportCSV = () => {
    if (sessions.length === 0) {
      notify('There are no sessions to export.', 'info');
      return;
    }
    try {
      downloadTextFile(`smartcrutch-sessions-${new Date().toISOString().slice(0, 10)}.csv`, sessionsToCSV(sorted, unit));
      logActivity('session', `Exported ${sessions.length} session(s) to CSV`);
      notify(`Exported ${sessions.length} session(s) to CSV`);
    } catch {
      notify('The CSV file could not be created in this browser.', 'error');
    }
  };

  const generateSamples = () => {
    const now = Date.now();
    const list = Array.from({ length: 5 }, (_, i) => {
      const end = now - (i + 1) * 86400000 + Math.round((Math.random() - 0.5) * 4 * 3600000);
      return generateDemoSession(end, 240 + Math.round(Math.random() * 600), thresholds);
    });
    addSessions(list);
    logActivity('session', 'Generated 5 simulated sample sessions');
    notify('Added 5 simulated sample sessions');
  };

  return (
    <>
      <PageHeader
        title="Session History"
        subtitle="Saved sessions are stored only in this browser."
        actions={
          <>
            <button className="btn btn-ghost" onClick={generateSamples} title="Creates simulated sessions for exploring the app">
              <FlaskConical size={16} /> Add sample sessions
            </button>
            <button className="btn btn-primary" onClick={exportCSV} disabled={sessions.length === 0}>
              <Download size={16} /> Export CSV
            </button>
          </>
        }
      />

      {sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<History size={32} />}
            title="No saved sessions yet"
            action={
              <div className="row gap center">
                {settings.mode === 'demo' && (
                  <button className="btn btn-primary" onClick={() => live.startSession() && navigate('live')} disabled={live.recording}>
                    <Play size={16} /> Start a demo session
                  </button>
                )}
                <button className="btn btn-ghost" onClick={generateSamples}>
                  <FlaskConical size={16} /> Add sample sessions
                </button>
              </div>
            }
          >
            Sessions are saved automatically when you stop recording on the Live Monitoring page. You can also add simulated sample sessions to explore
            this page.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid stats-grid">
            <div className="card stat-card">
              <Stat label="Sessions" icon={<History size={16} />} value={totals.n} hint={`${totals.strikes.toLocaleString()} est. crutch strikes`} />
            </div>
            <div className="card stat-card">
              <Stat label="Total time" icon={<Clock size={16} />} value={fmtDurationWords(totals.time)} hint={`Avg ${fmtDurationWords(totals.avgDuration)} per session`} />
            </div>
            <div className="card stat-card">
              <Stat label="Average peak load" icon={<Gauge size={16} />} value={toUnit(totals.avgPeak, unit).toFixed(unitDigits(unit))} unit={unit} hint={`Current limit ${fmtLoad(thresholds.maxLoadKg, unit, 0)}`} />
            </div>
            <div className="card stat-card">
              <Stat label="Over-limit events" icon={<TriangleAlert size={16} />} value={totals.over} tone={totals.over > 0 ? 'caution' : 'ok'} hint="Across all sessions" />
            </div>
          </div>

          <Card
            title="Saved sessions"
            icon={<History size={18} />}
            actions={
              <>
                <label className="inline-select">
                  <span>Sort</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="longest">Longest first</option>
                    <option value="peak">Highest peak load</option>
                  </select>
                </label>
                <button className="btn btn-ghost btn-sm danger-text" onClick={() => setConfirmClear(true)}>
                  <Trash2 size={14} /> Clear all
                </button>
              </>
            }
          >
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Duration</th>
                    <th className="num">Avg load</th>
                    <th className="num">Peak load</th>
                    <th className="num">Over-limit</th>
                    <th className="hide-sm">Load trace</th>
                    <th>Source</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => {
                    const open = expanded === s.id;
                    const over = s.peakLoadKg > s.thresholds.maxLoadKg;
                    return (
                      <SessionRow
                        key={s.id}
                        s={s}
                        open={open}
                        over={over}
                        unit={unit}
                        onToggle={() => setExpanded(open ? null : s.id)}
                        onDelete={() => setToDelete(s)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="fine">
              The Source column shows whether a session holds <strong>simulated</strong> demo readings or data received from the ESP32. Hardware weights use
              the firmware’s unverified scale factor. Statistics use the thresholds that were active during each session.
            </p>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this session?"
        confirmLabel="Delete session"
        tone="danger"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            deleteSession(toDelete.id);
            logActivity('session', `Deleted session from ${fmtDateTime(toDelete.startedAt)}`);
            notify('Session deleted');
          }
          setToDelete(null);
        }}
      >
        <p>
          The session from <strong>{toDelete && fmtDateTime(toDelete.startedAt)}</strong> ({toDelete && fmtDurationWords(toDelete.durationSec)}) will be
          permanently removed from this browser. Export a CSV first if you want to keep a copy.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmClear}
        title={`Delete all ${sessions.length} sessions?`}
        confirmLabel="Delete all sessions"
        tone="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearSessions();
          logActivity('session', `Cleared ${sessions.length} saved session(s)`);
          notify('All sessions deleted');
          setConfirmClear(false);
        }}
      >
        <p>This permanently removes every saved session from this browser. This cannot be undone.</p>
      </ConfirmDialog>
    </>
  );
}

function SessionRow({
  s,
  open,
  over,
  unit,
  onToggle,
  onDelete,
}: {
  s: SessionRecord;
  open: boolean;
  over: boolean;
  unit: LoadUnit;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr className={open ? 'row-open' : ''}>
        <td>
          <button className="row-toggle" onClick={onToggle} aria-expanded={open}>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {fmtDateTime(s.startedAt)}
          </button>
        </td>
        <td className="mono">{fmtDuration(s.durationSec)}</td>
        <td className="num">{fmtLoad(s.avgLoadKg, unit)}</td>
        <td className={`num ${over ? 'over-text' : ''}`}>
          {over && <TriangleAlert size={13} aria-label="Above limit" />} {fmtLoad(s.peakLoadKg, unit)}
        </td>
        <td className="num">{s.overloadEvents}</td>
        <td className="hide-sm">
          <Sparkline values={s.trace} max={Math.max(s.thresholds.maxLoadKg * 1.4, ...s.trace)} threshold={s.thresholds.maxLoadKg} ariaLabel="Peak load trace" />
        </td>
        <td>{s.source === 'hardware' ? <Badge tone="navy">ESP32 hardware</Badge> : <Badge tone="teal">Simulated</Badge>}</td>
        <td className="actions-cell">
          <button className="icon-btn danger" onClick={onDelete} aria-label={`Delete session from ${fmtDateTime(s.startedAt)}`}>
            <Trash2 size={16} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={8}>
            <div className="detail-grid">
              <Stat label="Started" value={<span className="small-val">{fmtDateTime(s.startedAt)}</span>} />
              <Stat label="Ended" value={<span className="small-val">{fmtDateTime(s.endedAt)}</span>} />
              <Stat label="Avg |angle|" value={s.avgAngleDeg.toFixed(1)} unit="°" />
              <Stat label="Max |angle|" value={s.maxAngleDeg.toFixed(1)} unit="°" />
              <Stat label="Warnings" value={s.warningEvents} />
              <Stat label="Tilt events" value={s.tiltEvents} />
              <Stat label="Time over limit" value={s.timeOverLoadPct.toFixed(1)} unit="%" />
              <Stat label="Est. strikes" value={s.estimatedStrikes} />
              <Stat label="Samples" value={s.sampleCount.toLocaleString()} />
              <Stat
                label="Thresholds used"
                value={
                  <span className="small-val">
                    {fmtLoad(s.thresholds.maxLoadKg, unit, 0)} · {s.thresholds.warnPercent}% · ±{s.thresholds.maxTiltDeg}°
                  </span>
                }
              />
            </div>
            <SourceTag simulated={s.source === 'demo'} />
          </td>
        </tr>
      )}
    </>
  );
}
