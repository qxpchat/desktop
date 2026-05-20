// Top-level preferences store, persisted to localStorage.
// Phase 1 covers theme + pane-2 width + pane-1 collapsed flag; later phases
// extend this file rather than scattering preference keys.

import { invoke, isTauri } from '@tauri-apps/api/core';

const STORAGE_KEY = 'qxp.web.prefs';

export type Theme = 'system' | 'light' | 'dark';

export type Prefs = {
  pane2Width: number;
  pane1Collapsed: boolean;
  theme: Theme;
  /** Global fallback accent used when no per-profile override exists.
   *  Kept as a top-level field rather than a constant so an older single-
   *  account save still round-trips through `load`/`savePrefs`. */
  accent: string;
  /** Per-account accent override. The picker in Settings → Appearance writes
   *  here keyed by `accounts.selectedId`; everything else reads via
   *  `getAccent(id)` which falls back to `accent`. */
  accentByAccount: Record<number, string>;
  /** Multiplier on the `--text-*` tokens. 1.0 = default; the picker in
   *  Settings → Appearance offers Small / Default / Large / X-Large. */
  textScale: number;
  /** Locale override; null = follow browser. */
  language: string | null;
  /** Linux + Windows: hide the window into a system-tray icon instead of
   *  quitting when the close button is clicked. macOS hides unconditionally
   *  (native dock pattern) regardless of this value. */
  minimizeToTray: boolean;
};

export const DEFAULT_ACCENT = '#22ccaa';

// Windows users expect chat apps to minimize to tray on close (Signal,
// Telegram, Discord, Slack, Teams all do). Linux defaults off because vanilla
// GNOME hides tray icons without the AppIndicator extension, which would
// strand the window. macOS ignores the value entirely.
const DEFAULT_MINIMIZE_TO_TRAY =
  typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

const DEFAULTS: Prefs = {
  pane2Width: 320,
  // Profile rail (`NavTabs`) hidden by default — it pops out from the
  // burger button in the chat-list header on demand and overlays the
  // chat list without reflowing it.
  pane1Collapsed: true,
  theme: 'system',
  accent: DEFAULT_ACCENT,
  accentByAccount: {},
  textScale: 1,
  language: null,
  minimizeToTray: DEFAULT_MINIMIZE_TO_TRAY,
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

/** Active accent for the given account — per-profile override if the user
 *  has picked one, otherwise the global fallback. `null` (no account
 *  selected, e.g. onboarding or boot screen) yields the global fallback. */
export function getAccent(accountId: number | null): string {
  if (accountId == null) return prefs.accent;
  return prefs.accentByAccount[accountId] ?? prefs.accent;
}

/** Persist a per-profile accent. The first time any account sets a value,
 *  the global fallback also tracks it so the next *new* account inherits a
 *  sensible default instead of snapping back to teal. */
export function setAccent(accountId: number | null, color: string): void {
  if (accountId == null) {
    prefs.accent = color;
  } else {
    prefs.accentByAccount[accountId] = color;
    prefs.accent = color;
  }
  savePrefs();
}

export function savePrefs(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota exceeded or storage disabled — silently ignore */
  }
}

/** Push the current `minimizeToTray` value to the Tauri shell so the close
 *  handler and tray icon match. Safe to call in browser mode — `isTauri()`
 *  short-circuits. */
export function syncMinimizeToTray(): void {
  if (!isTauri()) return;
  void invoke('set_minimize_to_tray', { enabled: prefs.minimizeToTray }).catch(
    () => undefined,
  );
}

/** Setter for the Appearance toggle — flips the pref, persists, and tells
 *  the Tauri shell to build/tear-down the tray + flip the close behaviour. */
export function setMinimizeToTray(enabled: boolean): void {
  prefs.minimizeToTray = enabled;
  savePrefs();
  syncMinimizeToTray();
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
