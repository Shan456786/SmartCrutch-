import { CircleCheck, Compass, Footprints, Gauge, OctagonAlert, Play, PlugZap, Square, Timer, TriangleAlert, Unplug, Usb } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { HW_STALE_MS, useLive } from '../state/LiveContext';
import { Card, NotConnected, PageHeader, Segmented, SerialStatusBadge, SourceTag, Stat } from '../components/ui';
import { LiveLineChart } from '../components/charts';
import { CHART_WINDOWS } from '../lib/defaults';
import { fmtDuration, fmtLoad, toUnit, unitDigits, zoneLabel } from '../lib/format';
import { href } from '../lib/router';
import type { LoadZone } from '../types';

const ZONE_ICON: Record<LoadZone, typeof CircleCheck> = { safe: CircleCheck, caution: TriangleAlert, over: OctagonAlert };

export function LiveMonitoring() {
  const { settings, thresholds, updateSettings } = useApp();
  const live = useLive();
  const unit = settings.loadUnit;
  const isDemo = settings.mode === 'demo';
  const { serial } = live;
  const digits = unitDigits(unit);
  const tag = <SourceTag simulated={isDemo} />;

  const header = (
    <PageHeader
      title="Live Monitoring"
      subtitle={isDemo ? 'Simulated crutch load and angle, updated in real time.' : 'Crutch load and angle from the ESP32 over USB serial.'}
      actions={
        <>
          {live.recording && live.session && (
            <span className="timer-pill" aria-live="off">
              <span className="rec-dot" aria-hidden />
              <Timer size={16} aria-hidden /> {fmtDuration(live.session.elapsedSec)}
            </span>
          )}
          {live.recording ? (
            <button className="btn btn-danger" onClick={() => live.stopSession()}>
              <Square size={16} /> Stop &amp; save session
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => live.startSession()}
              disabled={!live.canRecord}
              title={live.canRecord ? undefined : 'Recording needs live hardware data'}
            >
              <Play size={16} /> Start session
            </button>
          )}
        </>
      }
    />
  );

  const hwControls = !isDemo && (
    <div className="hw-strip">
      <span className="hw-strip-label">
        <Usb size={16} aria-hidden /> ESP32 serial
      </span>
      <SerialStatusBadge status={serial.status} />
      {serial.portLabel && <span className="muted mono-sm">{serial.portLabel}</span>}
      <span className="muted mono-sm">
        {serial.validMessages} valid · {serial.ignoredLines} ignored
      </span>
      {serial.deviceUnsafe !== null && serial.status === 'live' && (
        <span className={`zone-text ${serial.deviceUnsafe ? 'zone-over' : 'zone-safe'}`}>
          {serial.deviceUnsafe ? <OctagonAlert size={15} aria-hidden /> : <CircleCheck size={15} aria-hidden />}
          Firmware flag: {serial.deviceUnsafe ? 'UNSAFE' : 'safe'}
        </span>
      )}
      <span className="hw-strip-actions">
        {serial.status === 'waiting' || serial.status === 'live' ? (
          <button className="btn btn-ghost btn-sm" onClick={() => void live.disconnectHardware()}>
            <Unplug size={14} /> Disconnect
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => void live.connectHardware()} disabled={serial.status !== 'disconnected'}>
            <PlugZap size={14} /> Connect Hardware
          </button>
        )}
      </span>
    </div>
  );

  // In hardware mode, readings are only shown once a valid protocol message has been parsed.
  const hasHardwareData = !isDemo && live.latest !== null && (serial.status === 'live' || serial.status === 'waiting');
  if (!live.latest || (!isDemo && !hasHardwareData)) {
    return (
      <>
        {header}
        {hwControls}
        <Card>
          {isDemo ? (
            <p className="muted">Waiting for the first simulated sample…</p>
          ) : (
            <>
              <NotConnected status={serial.status} />
              {serial.error && <p className="form-error-banner">{serial.error}</p>}
              {serial.status === 'waiting' && serial.lastRawLine && (
                <p className="fine">
                  Last line received (not a SmartCrutch+ message): <code className="raw-line">{serial.lastRawLine}</code>
                </p>
              )}
              <p className="fine">
                Port settings, protocol details and firmware instructions are in <a href={href('settings')}>Device &amp; Settings</a>. Simulated data is
                only available in Demo mode.
              </p>
            </>
          )}
        </Card>
      </>
    );
  }

  const latest = live.latest;
  const loadDisp = toUnit(latest.loadKg, unit);
  const maxDisp = toUnit(thresholds.maxLoadKg, unit);
  const warnDisp = (maxDisp * thresholds.warnPercent) / 100;
  const ZoneIcon = ZONE_ICON[live.zone];
  const scaleMax = Math.max(maxDisp * 1.4, loadDisp);
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;

  const loadPoints = live.buffer.map((s) => ({ x: (s.t - latest.t) / 1000, y: toUnit(s.loadKg, unit) }));
  const anglePoints = live.buffer.map((s) => ({ x: (s.t - latest.t) / 1000, y: s.angleDeg }));
  const angleRange = Math.max(45, Math.ceil((thresholds.maxTiltDeg + 10) / 5) * 5);
  const loadMax = Math.max(maxDisp * 1.35, ...loadPoints.slice(-settings.chartWindowSec * settings.sampleRateHz).map((p) => p.y * 1.1));

  return (
    <>
      {header}
      {hwControls}
      {serial.stale && !isDemo && (
        <div className="stale-banner" role="status">
          <TriangleAlert size={16} aria-hidden /> No valid data for more than {HW_STALE_MS / 1000} s — the values below are the last ones received, not live.
        </div>
      )}

      <div className="grid live-grid">
        <section className={`card readout zone-${live.zone}`} aria-label="Current load">
          <div className="readout-head">
            <span className="stat-label">
              <Gauge size={16} aria-hidden /> Crutch load
            </span>
            {tag}
          </div>
          <div className="readout-value" aria-live="off">
            {loadDisp.toFixed(digits)}
            <span className="readout-unit">{unit}</span>
          </div>
          <div className={`zone-text zone-${live.zone} big`}>
            <ZoneIcon size={18} aria-hidden /> {zoneLabel[live.zone]}
          </div>
          <div className="threshold-meter" role="meter" aria-valuemin={0} aria-valuemax={scaleMax} aria-valuenow={loadDisp} aria-label="Load relative to safe-load threshold">
            <div className={`meter-fill zone-${live.zone}`} style={{ width: pct(loadDisp) }} />
            <span className="meter-mark warn" style={{ left: pct(warnDisp) }} title={`Warning ${warnDisp.toFixed(digits)} ${unit}`} />
            <span className="meter-mark max" style={{ left: pct(maxDisp) }} title={`Limit ${maxDisp.toFixed(digits)} ${unit}`} />
          </div>
          <div className="meter-legend">
            <span>0</span>
            <span>
              Warning {warnDisp.toFixed(digits)} · <strong>Limit {fmtLoad(thresholds.maxLoadKg, unit)}</strong>
            </span>
          </div>
        </section>

        <section className={`card readout ${live.tiltAlert ? 'zone-over' : 'zone-safe'}`} aria-label="Current crutch angle">
          <div className="readout-head">
            <span className="stat-label">
              <Compass size={16} aria-hidden /> {isDemo ? 'Crutch angle from vertical' : 'Crutch angle (firmware)'}
            </span>
            {tag}
          </div>
          <div className="readout-value">
            {latest.angleDeg.toFixed(1)}
            <span className="readout-unit">°</span>
          </div>
          <div className={`zone-text big ${live.tiltAlert ? 'zone-over' : 'zone-safe'}`}>
            {live.tiltAlert ? <TriangleAlert size={18} aria-hidden /> : <CircleCheck size={18} aria-hidden />}
            {live.tiltAlert ? `Tilt above ±${thresholds.maxTiltDeg}°` : `Within ±${thresholds.maxTiltDeg}°`}
          </div>
          <div className="angle-dial" aria-hidden>
            <svg viewBox="-60 -60 120 70" width="100%" height="90">
              <path d="M-50,0 A50,50 0 0 1 50,0" className="dial-track" />
              {[-1, 1].map((sgn) => {
                const a = ((sgn * thresholds.maxTiltDeg - 90) * Math.PI) / 180;
                return <line key={sgn} x1={0} y1={0} x2={54 * Math.cos(a)} y2={54 * Math.sin(a)} className="ref-line ref-danger" />;
              })}
              <line
                x1={0}
                y1={0}
                x2={46 * Math.cos(((Math.max(-90, Math.min(90, latest.angleDeg)) - 90) * Math.PI) / 180)}
                y2={46 * Math.sin(((Math.max(-90, Math.min(90, latest.angleDeg)) - 90) * Math.PI) / 180)}
                className={`dial-needle ${live.tiltAlert ? 'alert' : ''}`}
              />
              <circle r={4} className="dial-hub" />
            </svg>
          </div>
        </section>

        <section className="card session-card" aria-label="Session">
          <div className="readout-head">
            <span className="stat-label">
              <Timer size={16} aria-hidden /> Session
            </span>
            {live.recording ? <span className="badge badge-red"><span className="rec-dot" /> Recording</span> : <span className="badge badge-gray">Idle</span>}
          </div>
          <div className="readout-value timer">{fmtDuration(live.session?.elapsedSec ?? 0)}</div>
          {live.session ? (
            <div className="mini-stats">
              <Stat label="Peak" value={toUnit(live.session.peakLoadKg, unit).toFixed(digits)} unit={unit} />
              <Stat label="Over-limit" value={live.session.overloadEvents} tone={live.session.overloadEvents ? 'over' : 'default'} />
              <Stat label="Warnings" value={live.session.warningEvents} />
              <Stat label="Tilt events" value={live.session.tiltEvents} />
              <Stat label="Est. strikes" icon={<Footprints size={14} />} value={live.session.strikes} />
              <Stat label="Samples" value={live.session.samples} />
            </div>
          ) : (
            <p className="muted">
              Press <strong>Start session</strong> to begin recording. The session is saved to Session History when you stop it.
            </p>
          )}
          {live.recording ? (
            <button className="btn btn-danger btn-block" onClick={() => live.stopSession()}>
              <Square size={16} /> Stop &amp; save
            </button>
          ) : (
            <button className="btn btn-primary btn-block" onClick={() => live.startSession()} disabled={!live.canRecord}>
              <Play size={16} /> Start session
            </button>
          )}
        </section>
      </div>

      <Card
        title="Load over time"
        icon={<Gauge size={18} />}
        actions={
          <Segmented
            ariaLabel="Chart time window"
            value={settings.chartWindowSec}
            onChange={(v) => updateSettings({ chartWindowSec: v })}
            options={CHART_WINDOWS.map((w) => ({ value: w, label: `${w}s` }))}
          />
        }
      >
        <LiveLineChart
          points={loadPoints}
          xWindow={settings.chartWindowSec}
          yMin={0}
          yMax={loadMax}
          refLines={[
            { value: warnDisp, label: `Warning ${warnDisp.toFixed(digits)}`, tone: 'warn' },
            { value: maxDisp, label: `Limit ${maxDisp.toFixed(digits)}`, tone: 'danger' },
          ]}
          formatY={(v) => `${v.toFixed(v < 10 && unit !== 'g' ? 1 : 0)} ${unit}`}
          yLabel="load"
          ariaLabel={`Live crutch load chart, last ${settings.chartWindowSec} seconds, ${isDemo ? 'simulated data' : 'hardware data'}`}
        />
        <div className="chart-foot">
          {tag}
          <span className="fine">
            {isDemo
              ? 'Hover the chart to inspect values. Dashed lines are your configured warning level and limit.'
              : 'Weight as reported by the firmware (HX711 read() ÷ 230, in grams). This scale factor has not been verified against a reference weight.'}
          </span>
        </div>
      </Card>

      <Card title="Crutch angle over time" icon={<Compass size={18} />}>
        <LiveLineChart
          points={anglePoints}
          xWindow={settings.chartWindowSec}
          yMin={-angleRange}
          yMax={angleRange}
          symmetric
          refLines={[{ value: thresholds.maxTiltDeg, label: `±${thresholds.maxTiltDeg}°`, tone: 'danger' }]}
          formatY={(v) => `${Math.round(v)}°`}
          yLabel="angle"
          ariaLabel={`Live crutch angle chart, last ${settings.chartWindowSec} seconds, ${isDemo ? 'simulated data' : 'hardware data'}`}
        />
        <div className="chart-foot">
          {tag}
          <span className="fine">
            {isDemo
              ? 'Positive = forward of vertical, negative = backward (simulated convention, not a hardware specification).'
              : 'Angle as computed by the firmware: atan2(acceleration.y, acceleration.z) × 180 / π. Its zero point depends on how the ADXL345 is mounted.'}
          </span>
        </div>
      </Card>
    </>
  );
}
