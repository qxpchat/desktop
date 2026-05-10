// Minimal i18n shell. Phase 21 lays the API; Phase 21+ delivers a script
// that converts `references/deltachat-ios/.../Localizable.strings` into
// per-locale JSON files we ship from the daemon's embedded assets.
//
// For now `t()` just returns the source key (acting as the English string)
// and ICU-style `{name}` placeholders are interpolated.

export type LocaleStrings = Record<string, string>;

const DEFAULT_LOCALE: LocaleStrings = {
  /* populate or replace via setLocale() */
};

let active: LocaleStrings = DEFAULT_LOCALE;
let activeTag = 'en';

export function setLocale(strings: LocaleStrings, tag: string): void {
  active = strings;
  activeTag = tag;
}

export function getLocaleTag(): string {
  return activeTag;
}

export function t(key: string, args?: Record<string, string | number>): string {
  let s = active[key] ?? key;
  if (args) {
    for (const [k, v] of Object.entries(args)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

/** Plural helper. `n` is the count; `one` is used for n==1, `other` otherwise. */
export function plural(n: number, one: string, other: string): string {
  return n === 1 ? one.replace('{count}', '1') : other.replace('{count}', String(n));
}

/** Async loader for per-locale JSON, served from `/locales/<tag>.json`. */
export async function loadLocale(tag: string): Promise<void> {
  try {
    const res = await fetch(`/locales/${tag}.json`);
    if (!res.ok) return;
    const data = (await res.json()) as LocaleStrings;
    setLocale(data, tag);
  } catch {
    /* fall back silently — `t()` returns the key itself */
  }
}

/** Best-effort: pick a locale (from prefs override or browser) and load it.
 *  Always loads English first as a baseline; if the requested locale is
 *  available it overlays on top. Returns the tag that ended up active. */
export async function loadPreferredLocale(override: string | null): Promise<string> {
  const wanted =
    override ??
    (typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en');
  await loadLocale('en');
  if (wanted !== 'en') {
    const before = activeTag;
    await loadLocale(wanted);
    if (activeTag === before) {
      // load failed; keep English active
      return 'en';
    }
  }
  return activeTag;
}
