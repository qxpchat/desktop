// Minimal i18n module. The translation key IS the English source string —
// templates write `{t('Send')}` and the JSON files under `public/locales/`
// supply per-locale overrides. Missing keys fall back to the English source,
// so a partial translation never blocks the UI.
//
// `state` is a Svelte `$state` so template `t()` calls re-render when the
// active locale changes (e.g. when locale JSON finishes loading at startup).

export type LocaleStrings = Record<string, string>;

type State = {
  strings: LocaleStrings;
  tag: string;
};

const state = $state<State>({
  strings: {},
  tag: 'en',
});

export function setLocale(strings: LocaleStrings, tag: string): void {
  state.strings = strings;
  state.tag = tag;
}

export function getLocaleTag(): string {
  return state.tag;
}

export function t(key: string, args?: Record<string, string | number>): string {
  let s = state.strings[key] ?? key;
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

/** Pick a locale (from prefs override or browser) and load it. English is
 *  loaded as the baseline first; if the requested locale loads on top, the
 *  template re-renders thanks to the runes-backed state. Returns the tag
 *  that ended up active. */
export async function loadPreferredLocale(override: string | null): Promise<string> {
  const wanted =
    override ??
    (typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en');
  await loadLocale('en');
  if (wanted !== 'en') {
    const before = state.tag;
    await loadLocale(wanted);
    if (state.tag === before) return 'en';
  }
  return state.tag;
}
