// Global message search — backs the secondary results section in pane 2 when
// the user types into the chatlist search.
// Calls `searchMessages(accountId, query, chatId?)` from `deltachat-jsonrpc`
// (returns a flat list of msg ids), then `get_messages` to hydrate previews.

import { rpc } from '../rpc';

export type Hit = {
  id: number;
  chatId: number;
  text: string;
  timestamp: number;
  sender: string;
  chatName: string;
};

export const messageSearch = $state<{
  accountId: number | null;
  query: string;
  hits: Hit[];
  loading: boolean;
}>({
  accountId: null,
  query: '',
  hits: [],
  loading: false,
});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let gen = 0;

export function setSearchAccount(id: number | null): void {
  messageSearch.accountId = id;
  messageSearch.hits = [];
}

export function setMessageSearchQuery(q: string): void {
  messageSearch.query = q;
  if (debounceTimer != null) clearTimeout(debounceTimer);
  if (!q.trim()) {
    messageSearch.hits = [];
    return;
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void run();
  }, 200);
}

async function run() {
  const accountId = messageSearch.accountId;
  if (accountId == null) return;
  const query = messageSearch.query.trim();
  if (!query) return;
  const myGen = ++gen;
  messageSearch.loading = true;
  try {
    const ids = await rpc.call<number[]>('search_messages', [accountId, query, null]);
    if (myGen !== gen) return;
    if (ids.length === 0) {
      messageSearch.hits = [];
      return;
    }
    const map = await rpc.call<
      Record<
        number,
        | {
            kind: 'message';
            id: number;
            chatId: number;
            text: string;
            timestamp: number;
            sender?: { displayName?: string };
          }
        | { kind: 'loadingError' }
      >
    >('get_messages', [accountId, ids.slice(0, 100)]);
    if (myGen !== gen) return;
    const hits: Hit[] = [];
    for (const id of ids) {
      const r = map[id];
      if (!r || r.kind !== 'message') continue;
      hits.push({
        id: r.id,
        chatId: r.chatId,
        text: r.text,
        timestamp: r.timestamp,
        sender: r.sender?.displayName ?? '',
        chatName: '',
      });
    }
    messageSearch.hits = hits;
  } catch (err) {
    if (myGen === gen) {
      console.warn('search failed:', err);
      messageSearch.hits = [];
    }
  } finally {
    if (myGen === gen) messageSearch.loading = false;
  }
}
