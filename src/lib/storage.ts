const PREFIX = 'smartcrutch-plus:v1:';

export const STORAGE_KEYS = {
  profile: 'profile',
  notes: 'notes',
  thresholds: 'thresholds',
  settings: 'settings',
  sessions: 'sessions',
  contacts: 'contacts',
  activity: 'activity',
} as const;

export function loadJSON<T>(key: string, fallback: T, validate?: (value: unknown) => boolean): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    // Merge plain objects with their defaults so newly added fields get sensible values.
    if (isPlainObject(fallback) && isPlainObject(parsed)) {
      return { ...fallback, ...parsed } as T;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** Returns false if the browser refused the write (quota exceeded, storage disabled, etc.). */
export function saveJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearAllAppData(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const isArray = (v: unknown): boolean => Array.isArray(v);
export const isObject = (v: unknown): boolean => isPlainObject(v);
