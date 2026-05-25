// Per-account MRU store of cached GIFs, used by the GIF picker's "Recents"
// panel and by MessageBubble to look up the local cache file for an
// incoming/outgoing giphy URL.
//
// Sort order in the panel is "most used first, ties broken by most-recently-
// used" — bumped on the first render of each unique message id. The seen-
// msg-id set is persisted (capped) so reloading the chat doesn't re-inflate
// counts for messages we've already counted.

const STORAGE_KEY = 'qxp.web.gifRecents';
const SEEN_KEY = 'qxp.web.gifRecentsSeen';
const MAX_RECENTS = 200;
const MAX_SEEN_PER_ACCOUNT = 1000;

export type GifRecent = {
  /** Giphy URL — the body actually sent over the wire. */
  url: string;
  /** Search term used when the GIF was picked. Empty for received GIFs. */
  term: string;
  /** Daemon-side path of the cached `.gif` file. */
  localPath: string;
  count: number;
  /** ms epoch of last use. */
  lastUsed: number;
};

type Persisted = { byAccount: Record<number, GifRecent[]> };

function loadRecents(): Persisted {
  if (typeof localStorage === 'undefined') return { byAccount: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byAccount: {} };
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed || typeof parsed !== 'object' || !parsed.byAccount) {
      return { byAccount: {} };
    }
    return parsed;
  } catch {
    return { byAccount: {} };
  }
}

export const gifRecents = $state<Persisted>(loadRecents());

function persistRecents() {
  if (typeof localStorage === 'undefined') return;
  try {
    // Cap each account's list independently — a chat that's seen many
    // unique GIFs shouldn't push another account's list into oblivion.
    const trimmed: Persisted = { byAccount: {} };
    for (const [acc, list] of Object.entries(gifRecents.byAccount)) {
      trimmed.byAccount[Number(acc)] = list.slice(0, MAX_RECENTS);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / private mode — best-effort */
  }
}

/** Either bump count + touch `lastUsed` if `url` already exists for `accountId`,
 *  or insert a fresh entry. `term` and `localPath` from an existing entry win
 *  unless the new call supplies a non-empty value — once a sender has labelled
 *  a GIF, later "received" bumps shouldn't wipe the label. */
export function recordGifUse(
  accountId: number,
  entry: { url: string; term: string; localPath: string },
): void {
  const list = gifRecents.byAccount[accountId] ?? [];
  const i = list.findIndex((r) => r.url === entry.url);
  const now = Date.now();
  if (i >= 0) {
    const existing = list[i];
    list[i] = {
      url: existing.url,
      term: entry.term || existing.term,
      localPath: entry.localPath || existing.localPath,
      count: existing.count + 1,
      lastUsed: now,
    };
  } else {
    list.unshift({
      url: entry.url,
      term: entry.term,
      localPath: entry.localPath,
      count: 1,
      lastUsed: now,
    });
  }
  gifRecents.byAccount[accountId] = list;
  persistRecents();
}

/** Drop the entry for `url` from `accountId`'s recents list. Idempotent. */
export function removeGif(accountId: number, url: string): void {
  const list = gifRecents.byAccount[accountId];
  if (!list) return;
  gifRecents.byAccount[accountId] = list.filter((r) => r.url !== url);
  persistRecents();
}

/** Lookup helper for MessageBubble — pulls the recents entry (if any) for
 *  this account+URL so the renderer can reuse the cached file path instead
 *  of re-downloading. */
export function getRecent(accountId: number, url: string): GifRecent | null {
  const list = gifRecents.byAccount[accountId];
  if (!list) return null;
  return list.find((r) => r.url === url) ?? null;
}

// ---------- per-message dedup ----------

type SeenMap = Record<number, string[]>;
let seenList: SeenMap = (() => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
})();
const seenSets: Record<number, Set<string>> = {};

function seenSet(accountId: number): Set<string> {
  if (!seenSets[accountId]) {
    seenSets[accountId] = new Set(seenList[accountId] ?? []);
  }
  return seenSets[accountId];
}

function persistSeen() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seenList));
  } catch {
    /* quota / private mode — best-effort */
  }
}

/** Returns `true` the first time it's called for a given (account, msgId)
 *  pair; `false` on every subsequent call. Persisted across reloads so
 *  re-rendering chat history doesn't re-bump recent counts. FIFO-capped per
 *  account at `MAX_SEEN_PER_ACCOUNT`. */
export function markGifMessageSeen(accountId: number, msgId: number): boolean {
  const key = String(msgId);
  const set = seenSet(accountId);
  if (set.has(key)) return false;
  set.add(key);
  const arr = (seenList[accountId] ?? []).concat([key]);
  if (arr.length > MAX_SEEN_PER_ACCOUNT) arr.splice(0, arr.length - MAX_SEEN_PER_ACCOUNT);
  seenList[accountId] = arr;
  persistSeen();
  return true;
}
