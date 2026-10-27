import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  ActivityEntry,
  ActivityKind,
  EmergencyContact,
  PatientProfile,
  RehabNote,
  SessionRecord,
  Settings,
  Thresholds,
} from '../types';
import { DEFAULT_SETTINGS, DEFAULT_THRESHOLDS, EMPTY_PROFILE } from '../lib/defaults';
import { STORAGE_KEYS, clearAllAppData, isArray, isObject, loadJSON, saveJSON } from '../lib/storage';
import { uid } from '../lib/format';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';
export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

interface AppState {
  profile: PatientProfile;
  saveProfile: (p: PatientProfile) => void;
  notes: RehabNote[];
  addNote: (author: string, text: string) => void;
  deleteNote: (id: string) => void;
  thresholds: Thresholds;
  saveThresholds: (t: Thresholds) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  sessions: SessionRecord[];
  addSession: (s: SessionRecord) => void;
  addSessions: (list: SessionRecord[]) => void;
  deleteSession: (id: string) => void;
  clearSessions: () => void;
  contacts: EmergencyContact[];
  saveContact: (c: EmergencyContact) => void;
  deleteContact: (id: string) => void;
  activity: ActivityEntry[];
  logActivity: (kind: ActivityKind, message: string) => void;
  clearActivity: () => void;
  toasts: Toast[];
  notify: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
  storageOk: boolean;
  resetAllData: () => void;
  resolvedTheme: 'light' | 'dark';
}

const AppContext = createContext<AppState | null>(null);

const MAX_ACTIVITY = 60;

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<PatientProfile>(() => loadJSON(STORAGE_KEYS.profile, EMPTY_PROFILE, isObject));
  const [notes, setNotes] = useState<RehabNote[]>(() => loadJSON(STORAGE_KEYS.notes, [], isArray));
  const [thresholds, setThresholds] = useState<Thresholds>(() =>
    loadJSON(STORAGE_KEYS.thresholds, DEFAULT_THRESHOLDS, isObject),
  );
  const [settings, setSettings] = useState<Settings>(() => loadJSON(STORAGE_KEYS.settings, DEFAULT_SETTINGS, isObject));
  const [sessions, setSessions] = useState<SessionRecord[]>(() => loadJSON(STORAGE_KEYS.sessions, [], isArray));
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => loadJSON(STORAGE_KEYS.contacts, [], isArray));
  const [activity, setActivity] = useState<ActivityEntry[]>(() => loadJSON(STORAGE_KEYS.activity, [], isArray));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  );

  // Every persisted slice is written on change; a failed write flags storage as unavailable.
  const persist = useCallback((key: string, value: unknown) => {
    if (!saveJSON(key, value)) setStorageOk(false);
  }, []);

  useEffect(() => persist(STORAGE_KEYS.profile, profile), [profile, persist]);
  useEffect(() => persist(STORAGE_KEYS.notes, notes), [notes, persist]);
  useEffect(() => persist(STORAGE_KEYS.thresholds, thresholds), [thresholds, persist]);
  useEffect(() => persist(STORAGE_KEYS.settings, settings), [settings, persist]);
  useEffect(() => persist(STORAGE_KEYS.sessions, sessions), [sessions, persist]);
  useEffect(() => persist(STORAGE_KEYS.contacts, contacts), [contacts, persist]);
  useEffect(() => persist(STORAGE_KEYS.activity, activity), [activity, persist]);

  // Theme handling
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const resolvedTheme: 'light' | 'dark' =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.density = settings.compactLayout ? 'compact' : 'comfortable';
  }, [resolvedTheme, settings.compactLayout]);

  const toastTimers = useRef(new Map<string, number>());
  const dismissToast = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimers.current.delete(id);
  }, []);
  const notify = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = uid();
      setToasts((ts) => [...ts.slice(-3), { id, message, tone }]);
      toastTimers.current.set(id, window.setTimeout(() => dismissToast(id), tone === 'error' ? 6000 : 3800));
    },
    [dismissToast],
  );

  const logActivity = useCallback((kind: ActivityKind, message: string) => {
    setActivity((a) => [{ id: uid(), at: new Date().toISOString(), kind, message }, ...a].slice(0, MAX_ACTIVITY));
  }, []);

  const value = useMemo<AppState>(
    () => ({
      profile,
      saveProfile: (p) => {
        setProfile(p);
        logActivity('profile', 'Patient profile updated');
      },
      notes,
      addNote: (author, text) => {
        setNotes((n) => [{ id: uid(), createdAt: new Date().toISOString(), author, text }, ...n]);
        logActivity('profile', 'Rehabilitation note added');
      },
      deleteNote: (id) => setNotes((n) => n.filter((x) => x.id !== id)),
      thresholds,
      saveThresholds: (t) => {
        setThresholds(t);
        logActivity('safety', 'Safety thresholds updated');
      },
      settings,
      updateSettings: (patch) => setSettings((s) => ({ ...s, ...patch })),
      sessions,
      addSession: (s) => setSessions((list) => [s, ...list]),
      addSessions: (newOnes) =>
        setSessions((list) => [...newOnes, ...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt))),
      deleteSession: (id) => setSessions((list) => list.filter((s) => s.id !== id)),
      clearSessions: () => setSessions([]),
      contacts,
      saveContact: (c) =>
        setContacts((list) => {
          let next = list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c];
          if (c.primary) next = next.map((x) => ({ ...x, primary: x.id === c.id }));
          if (!next.some((x) => x.primary) && next.length > 0) next = next.map((x, i) => ({ ...x, primary: i === 0 }));
          return next;
        }),
      deleteContact: (id) =>
        setContacts((list) => {
          const next = list.filter((x) => x.id !== id);
          if (next.length > 0 && !next.some((x) => x.primary)) next[0] = { ...next[0], primary: true };
          return next;
        }),
      activity,
      logActivity,
      clearActivity: () => setActivity([]),
      toasts,
      notify,
      dismissToast,
      storageOk,
      resetAllData: () => {
        clearAllAppData();
        setProfile(EMPTY_PROFILE);
        setNotes([]);
        setThresholds(DEFAULT_THRESHOLDS);
        setSettings(DEFAULT_SETTINGS);
        setSessions([]);
        setContacts([]);
        setActivity([]);
      },
      resolvedTheme,
    }),
    [profile, notes, thresholds, settings, sessions, contacts, activity, toasts, storageOk, resolvedTheme, logActivity, notify, dismissToast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
