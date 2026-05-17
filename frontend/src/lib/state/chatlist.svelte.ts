// Chatlist state for the currently-selected account.
//
// Backed by `get_chatlist_entries` (returns chat IDs in display order) +
// `get_chatlist_items_by_entries` (returns the per-row payload). Refreshes
// happen on:
//   - accounts.selectedId change (via setActiveAccount called from App.svelte)
//   - search query change (debounced 150 ms)
//   - ChatlistChanged event           — full reload
//   - ChatlistItemChanged{chat_id}    — single-row patch
//   - ChatlistItemChanged{chat_id:null} — reload visible items in place
//
// We also fold in IncomingMsg / MsgsChanged / ChatModified / ChatDeleted /
// ContactsChanged as defensive triggers; deltachat usually emits
// ChatlistChanged alongside, but the cost of an extra reload is small.

import { rpc } from '../rpc';
import { onEvent, type DcEvent } from '../events';

export type ChatListItem = {
  // Wire tag is PascalCase: the rust enum `ChatListItemFetchResult` has
  // `#[serde(rename_all = "camelCase")]` on each variant's *fields* only —
  // there's no enum-level rename, so the tag passes through as `"ChatListItem"`.
  kind: 'ChatListItem';
  id: number;
  name: string;
  avatarPath: string | null;
  color: string;
  chatType: 'Single' | 'Group' | 'Mailinglist' | 'OutBroadcast' | 'InBroadcast';
  lastUpdated: number | null; // ms since unix epoch
  summaryText1: string;
  summaryText2: string;
  summaryStatus: number;
  summaryPreviewImage: string | null;
  isEncrypted: boolean;
  /** Deprecated upstream — kept because the daemon still sends it. */
  isGroup: boolean;
  freshMessageCounter: number;
  isSelfTalk: boolean;
  isDeviceTalk: boolean;
  isSendingLocation: boolean;
  isSelfInGroup: boolean;
  isArchived: boolean;
  isPinned: boolean;
  isMuted: boolean;
  isContactRequest: boolean;
  dmChatContact: number | null;
  wasSeenRecently: boolean;
  lastMessageId: number | null;
};

type Entry =
  | ChatListItem
  | { kind: 'ArchiveLink'; freshMessageCounter: number }
  | { kind: 'Error'; id: number; error: string };

type Entries = Record<number, Entry>;

export type ChatlistState = {
  /** Account this chatlist mirrors. `null` while no account selected. */
  accountId: number | null;
  /** Chat IDs in display order (deltachat-supplied). Excludes archive-link entries. */
  ids: number[];
  /** Item payload by chat id. */
  items: Map<number, ChatListItem>;
  /** Current debounced search query (already applied to the fetched entries). */
  query: string;
  /** True while a fetch is in flight. */
  loading: boolean;
  /** When true, list shows only archived chats. */
  archivedOnly: boolean;
  /** True if the inbox has at least one archived chat (i.e. the archive-link
   *  entry exists in the daemon's response). */
  hasArchive: boolean;
};

export const chatlist = $state<ChatlistState>({
  accountId: null,
  ids: [],
  items: new Map(),
  query: '',
  loading: false,
  archivedOnly: false,
  hasArchive: false,
});

/** Mark a chat as unread by reverting the last incoming message back to
 *  fresh. Mirrors `deltachat-desktop`'s ChatContextMenu — the row's
 *  numeric badge ticks up to 1, just like a real new arrival. The caller
 *  is responsible for unselecting the chat first if it's currently open
 *  (otherwise `markNoticed` from the chat view immediately undoes this). */
export async function markChatUnread(chatId: number): Promise<void> {
  if (chatlist.accountId == null) return;
  try {
    await rpc.call('markfresh_chat', [chatlist.accountId, chatId]);
  } catch (err) {
    console.warn('markfresh_chat failed', err);
  }
}

/** Mark a chat as read from the chatlist context menu (without opening it). */
export async function markChatRead(chatId: number): Promise<void> {
  if (chatlist.accountId == null) return;
  try {
    await rpc.call('marknoticed_chat', [chatlist.accountId, chatId]);
  } catch (err) {
    console.warn('marknoticed_chat failed', err);
  }
}

/** DC_GCL_ARCHIVED_ONLY — `get_chatlist_entries` flag to scope to archived. */
const GCL_ARCHIVED_ONLY = 0x01;

export function setArchivedOnly(on: boolean): void {
  if (chatlist.archivedOnly === on) return;
  chatlist.archivedOnly = on;
  chatlist.ids = [];
  chatlist.items = new Map();
  void load();
}

let pendingQuery = '';
let queryDebounce: ReturnType<typeof setTimeout> | null = null;
let loadGen = 0;

// Chat currently open in pane 3. Its `items` payload is kept present even
// when a search filter excludes it from the rendered list, so the chat
// topbar and composer keep live metadata while the user types a query.
let pinnedChatId: number | null = null;

export function setActiveAccount(accountId: number | null): void {
  if (chatlist.accountId === accountId) return;
  chatlist.accountId = accountId;
  chatlist.ids = [];
  chatlist.items = new Map();
  if (accountId != null) void load();
}

/** Force a fresh chatlist fetch even if `accountId` hasn't changed. Useful
 *  after onboarding flows finish — the daemon DB has new chats / contacts but
 *  the rune was already pinned to that account so `setActiveAccount` would
 *  no-op. */
export function reloadChatlist(): void {
  if (chatlist.accountId == null) return;
  void load();
}

/** Pin the chat open in pane 3 so its `items` payload survives
 *  search-filtered reloads. The topbar / composer read chat metadata from
 *  `items`, but a search query can drop the chat from the fetched entries.
 *  Called by `selectChat`. */
export function pinChatItem(id: number | null): void {
  pinnedChatId = id;
  if (id != null && !chatlist.items.has(id)) void patchItem(id);
}

export function setSearchQuery(q: string): void {
  pendingQuery = q;
  if (queryDebounce != null) clearTimeout(queryDebounce);
  queryDebounce = setTimeout(() => {
    queryDebounce = null;
    if (pendingQuery !== chatlist.query) {
      chatlist.query = pendingQuery;
      void load();
    }
  }, 150);
}

async function load(): Promise<void> {
  const accountId = chatlist.accountId;
  if (accountId == null) return;

  const gen = ++loadGen;
  chatlist.loading = true;
  try {
    const ids = await rpc.call<number[]>('get_chatlist_entries', [
      accountId,
      chatlist.archivedOnly ? GCL_ARCHIVED_ONLY : null,
      chatlist.query.trim() || null,
      null,
    ]);
    if (gen !== loadGen || chatlist.accountId !== accountId) return;

    // Fetch the pinned (open) chat's payload alongside the visible entries —
    // even when a search filter dropped it from `ids` — so the topbar /
    // composer never blank out mid-search. It lands in `items` but not in
    // `ids`, so it isn't rendered as a list row.
    const fetchIds =
      pinnedChatId != null && !ids.includes(pinnedChatId) ? [...ids, pinnedChatId] : ids;

    const items = new Map<number, ChatListItem>();
    const visibleIds: number[] = [];
    let sawArchive = false;

    if (fetchIds.length > 0) {
      const entries = await rpc.call<Entries>('get_chatlist_items_by_entries', [
        accountId,
        fetchIds,
      ]);
      if (gen !== loadGen || chatlist.accountId !== accountId) return;
      for (const id of ids) {
        const e = entries[id];
        if (e && e.kind === 'ChatListItem') {
          items.set(id, e);
          visibleIds.push(id);
        } else if (e && e.kind === 'ArchiveLink') {
          sawArchive = true;
        } else if (e && e.kind === 'Error') {
          console.error(`chatlist entry #${id} failed:`, e.error);
        }
      }
      if (pinnedChatId != null && !items.has(pinnedChatId)) {
        const e = entries[pinnedChatId];
        if (e && e.kind === 'ChatListItem') items.set(pinnedChatId, e);
      }
    }

    chatlist.ids = visibleIds;
    chatlist.items = items;
    // The archive-link sentinel only shows up in inbox listings; preserve any
    // existing flag while archive-only is active so we know to come back. An
    // empty `ids` carries no archive signal — keep the prior flag.
    if (!chatlist.archivedOnly && ids.length > 0) chatlist.hasArchive = sawArchive;
  } catch (err) {
    console.error('chatlist load failed:', err);
  } finally {
    if (gen === loadGen) chatlist.loading = false;
  }
}

async function patchItem(chatId: number): Promise<void> {
  const accountId = chatlist.accountId;
  if (accountId == null) return;
  try {
    const entries = await rpc.call<Entries>('get_chatlist_items_by_entries', [
      accountId,
      [chatId],
    ]);
    if (chatlist.accountId !== accountId) return;
    const next = new Map(chatlist.items);
    const e = entries[chatId];
    if (e && e.kind === 'ChatListItem') next.set(chatId, e);
    else next.delete(chatId);
    chatlist.items = next;
  } catch (err) {
    console.warn('chatlist patch failed:', err);
  }
}

function isForActiveAccount(ev: DcEvent): boolean {
  return chatlist.accountId != null && ev.contextId === chatlist.accountId;
}

onEvent('ChatlistChanged', (ev) => {
  if (isForActiveAccount(ev)) void load();
});

onEvent('ChatlistItemChanged', (ev) => {
  if (!isForActiveAccount(ev)) return;
  const chatId = ev.event.chatId;
  if (typeof chatId === 'number') void patchItem(chatId);
  else void load(); // null = "all visible items" — simplest is reload
});
