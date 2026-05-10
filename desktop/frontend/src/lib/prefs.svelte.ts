// Top-level preferences store, persisted to localStorage.
// Phase 1 covers theme + pane-2 width + pane-1 collapsed flag; later phases
// extend this file rather than scattering preference keys.

const STORAGE_KEY = 'qxp.web.prefs';

export type Theme = 'system' | 'light' | 'dark';

export type Prefs = {
  pane2Width: number;
  pane1Collapsed: boolean;
  theme: Theme;
  accent: string;
  /** Locale override; null = follow browser. */
  language: string | null;
};

const DEFAULTS: Prefs = {
  pane2Width: 320,
  pane1Collapsed: false,
  theme: 'system',
  accent: '#22ccaa',
  language: null,
};

function load(): Prefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export const prefs = $state<Prefs>(load());

export function savePrefs(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota exceeded or storage disabled — silently ignore */
  }
}
