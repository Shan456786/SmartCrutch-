import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  CircleAlert,
  FlaskConical,
  History,
  LayoutDashboard,
  Menu,
  PlugZap,
  Settings as SettingsIcon,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import type { RouteId } from '../types';
import { href } from '../lib/router';
import { useApp } from '../state/AppContext';
import { SERIAL_STATUS_LABEL, useLive } from '../state/LiveContext';
import { fmtDuration } from '../lib/format';

export const NAV: { id: RouteId; label: string; short: string; icon: typeof Activity }[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { id: 'live', label: 'Live Monitoring', short: 'Live', icon: Activity },
  { id: 'safety', label: 'Safety Centre', short: 'Safety', icon: ShieldCheck },
  { id: 'history', label: 'Session History', short: 'History', icon: History },
  { id: 'profile', label: 'Patient Profile', short: 'Profile', icon: UserRound },
  { id: 'settings', label: 'Device & Settings', short: 'Device', icon: SettingsIcon },
];

function Brand() {
  return (
    <a className="brand" href={href('dashboard')}>
      <span className="brand-mark" aria-hidden>
        <svg viewBox="0 0 64 64" width="36" height="36">
          <rect width="64" height="64" rx="16" fill="currentColor" />
          <path d="M24 14h16M32 14v36M26 50h12" stroke="#2dd4bf" strokeWidth="5" strokeLinecap="round" />
          <path d="M44 22v10M39 27h10" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </span>
      <span>
        <span className="brand-name">
          SmartCrutch<span className="brand-plus">+</span>
        </span>
        <span className="brand-tagline">Helping every step heal better.</span>
      </span>
    </a>
  );
}

function DeviceChip() {
  const { settings } = useApp();
  const live = useLive();
  if (settings.mode === 'hardware') {
    const s = live.serial.status;
    return (
      <a className={`device-chip ${s === 'live' ? 'hw-live' : 'off'}`} href={href('settings')}>
        <PlugZap size={16} aria-hidden />
        <span>
          <strong>Hardware mode</strong>
          <small>{live.recording && live.session ? `Recording · ${fmtDuration(live.session.elapsedSec)}` : SERIAL_STATUS_LABEL[s]}</small>
        </span>
        {live.recording && <span className="rec-dot" aria-label="Recording" />}
      </a>
    );
  }
  return (
    <a className="device-chip demo" href={href('live')}>
      <FlaskConical size={16} aria-hidden />
      <span>
        <strong>Demo mode</strong>
        <small>{live.recording && live.session ? `Recording · ${fmtDuration(live.session.elapsedSec)}` : 'Simulated stream active'}</small>
      </span>
      {live.recording && <span className="rec-dot" aria-label="Recording" />}
    </a>
  );
}

function NavList({ route, onNavigate }: { route: RouteId; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main">
      <ul className="nav-list">
        {NAV.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <a href={href(id)} className={`nav-item ${route === id ? 'active' : ''}`} aria-current={route === id ? 'page' : undefined} onClick={onNavigate}>
              <Icon size={19} aria-hidden />
              <span>{label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PrototypeNote() {
  return (
    <p className="prototype-note">
      <CircleAlert size={14} aria-hidden />
      Student prototype — not a medically validated device. Thresholds are configurable examples, not clinical advice.
    </p>
  );
}

export function Layout({ route, children }: { route: RouteId; children: ReactNode }) {
  const { settings, storageOk } = useApp();
  const { serial } = useLive();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [route]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const current = NAV.find((n) => n.id === route);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <NavList route={route} />
        <div className="sidebar-foot">
          <DeviceChip />
          <PrototypeNote />
        </div>
      </aside>

      <header className="mobile-bar">
        <button className="icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu" aria-expanded={drawerOpen}>
          <Menu size={22} />
        </button>
        <Brand />
        <span className="mobile-page">{current?.label}</span>
      </header>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Navigation menu">
            <div className="drawer-head">
              <Brand />
              <button className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Close navigation menu">
                <X size={20} />
              </button>
            </div>
            <NavList route={route} onNavigate={() => setDrawerOpen(false)} />
            <div className="sidebar-foot">
              <DeviceChip />
              <PrototypeNote />
            </div>
          </aside>
        </div>
      )}

      <main className="main">
        {settings.mode === 'demo' ? (
          <div className="banner banner-demo" role="note">
            <FlaskConical size={16} aria-hidden />
            <span>
              <strong>Demo mode.</strong> All sensor readings in this app are <strong>SIMULATED / DEMO DATA</strong> generated in your
              browser — not from a real crutch.
            </span>
          </div>
        ) : (
          <div className={`banner ${serial.status === 'live' ? 'banner-live' : 'banner-hw'}`} role="note">
            <PlugZap size={16} aria-hidden />
            <span>
              <strong>Hardware mode — {SERIAL_STATUS_LABEL[serial.status]}.</strong>{' '}
              {serial.status === 'live'
                ? 'Readings come from the ESP32 over USB serial. Weight calibration has not been verified.'
                : 'No simulated values are shown in hardware mode. Readings appear only after valid SmartCrutch+ messages arrive.'}{' '}
              {serial.status !== 'live' && <a href={href('settings')}>Connect in Device &amp; Settings</a>}
            </span>
          </div>
        )}
        {!storageOk && (
          <div className="banner banner-error" role="alert">
            <CircleAlert size={16} aria-hidden />
            <span>Your browser blocked local storage. Changes will work for now but will not survive a reload.</span>
          </div>
        )}
        <div className="content">{children}</div>
        <footer className="app-footer">
          SmartCrutch+ · Student prototype · Data is stored only in this browser (localStorage).
        </footer>
      </main>

      <nav className="bottom-nav" aria-label="Quick navigation">
        {NAV.map(({ id, short, icon: Icon }) => (
          <a key={id} href={href(id)} className={route === id ? 'active' : ''} aria-current={route === id ? 'page' : undefined}>
            <Icon size={20} aria-hidden />
            <span>{short}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
