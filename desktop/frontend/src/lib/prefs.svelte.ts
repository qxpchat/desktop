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
  /** Multiplier on the `--text-*` tokens. 1.0 = default; the picker in
   *  Settings → Appearance offers Small / Default / Large / X-Large. */
  textScale: number;
  /** Locale override; null = follow browser. */
  language: string | null;
};

const DEFAULTS: Prefs = {
  pane2Width: 320,
  // Profile rail (`NavTabs`) hidden by default — it pops out from the
  // burger button in the chat-list header on demand and overlays the
  // chat list without reflowing it.
  pane1Collapsed: true,
  theme: 'system',
  accent: '#22ccaa',
  textScale: 1,
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

/// Picks the readable text colour for content laid over the given accent
/// hex. Mirrors iOS's per-hue table in `AppearanceSettings.swift` — derived
/// here from relative luminance with a 0.35 threshold, which agrees with
/// the iOS choices across the full 10-hue × 2-shade palette (light teal /
/// orange / green / yellow / cyan get black text; everything else white).
export function accentForeground(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#0a0a0a';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L < 0.35 ? '#ffffff' : '#0a0a0a';
}
