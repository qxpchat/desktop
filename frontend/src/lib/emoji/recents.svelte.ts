// Most-recently-used emoji store. Shared between the full emoji picker and
// the right-click-on-message quick-reaction row so both surfaces stay in
// sync — picking 🥹 from the reaction row should bump it to the front of
// the picker's Recents section too.

import { QUICK_REACTIONS } from './data';

const STORAGE_KEY = 'qxp.web.emojiRecents';
const MAX_RECENTS = 32;

function load(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const emojiRecents = $state<{ list: string[] }>({ list: load() });

function persist() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emojiRecents.list.slice(0, MAX_RECENTS)));
  } catch {
    /* quota / private mode — best-effort */
  }
}

/** Bump `emoji` to the front of the recents list (move-to-front semantics). */
export function recordEmojiUse(emoji: string): void {
  emojiRecents.list = [emoji, ...emojiRecents.list.filter((x) => x !== emoji)].slice(
    0,
    MAX_RECENTS,
  );
  persist();
}

/** First-N recents, padded with QUICK_REACTIONS to keep the row a stable
 *  length on first use (and dedup-ed so a fresh recent doesn't duplicate
 *  the default). */
export function quickRowEmojis(count = QUICK_REACTIONS.length): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emojiRecents.list) {
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= count) return out;
  }
  for (const e of QUICK_REACTIONS) {
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= count) return out;
  }
  return out;
}
