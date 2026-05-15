// Single source of truth for "which chats have a peer streaming
// live-location to us right now" + the latest stream point for each.
// Consumers: ChatListRow (icon next to name), MainPane (icon in chat
// topbar), ChatInfo (live-location card with map).
//
// Peer stream points are written by deltachat-core with `msgId == 0`
// (POI shares carry the message id; live-location points don't). Refresh
// triggers:
//   - every `LocationChanged` event
//   - a slow interval so chats drop out when the streaming window expires
//   - on demand via `refreshLiveLocations()` (e.g. after an account swap)

import { rpc } from '../rpc';
import { onEvent } from '../events';
import { accounts } from './accounts.svelte';

const PEER_WINDOW_S = 30 * 60;
const SELF_CONTACT = 1;
const TICK_MS = 30_000;

type Loc = {
  latitude: number;
  longitude: number;
  timestamp: number;
  contactId: number;
  msgId: number;
  chatId: number;
};

export type LivePoint = {
  lat: number;
  lon: number;
  contactId: number;
  timestamp: number;
};

export const liveLocations = $state<{
  /** Chat ids with at least one peer stream point in the last window. */
  chatIds: Set<number>;
  /** Most recent peer stream point per chat. */
  latest: Map<number, LivePoint>;
}>({
  chatIds: new Set(),
  latest: new Map(),
});

/** Re-query the daemon for active peer-streaming chats. Safe to call from
 *  anywhere — same-account requests serialise naturally via the RPC
 *  channel. */
export async function refreshLiveLocations(): Promise<void> {
  const accountId = accounts.selectedId;
  if (accountId == null) {
    if (liveLocations.chatIds.size > 0) liveLocations.chatIds = new Set();
    if (liveLocations.latest.size > 0) liveLocations.latest = new Map();
    return;
  }
  try {
    const cutoff = Math.floor(Date.now() / 1000) - PEER_WINDOW_S;
    const locs = await rpc.call<Loc[]>('get_locations', [
      accountId,
      null,
      null,
      cutoff,
      0,
    ]);
    if (accounts.selectedId !== accountId) return;

    const ids = new Set<number>();
    const latest = new Map<number, LivePoint>();
    for (const l of locs) {
      if (l.msgId !== 0 || l.contactId === SELF_CONTACT) continue;
      ids.add(l.chatId);
      const existing = latest.get(l.chatId);
      if (!existing || l.timestamp > existing.timestamp) {
        latest.set(l.chatId, {
          lat: l.latitude,
          lon: l.longitude,
          contactId: l.contactId,
          timestamp: l.timestamp,
        });
      }
    }
    if (!sameSet(ids, liveLocations.chatIds)) liveLocations.chatIds = ids;
    if (!sameLatest(latest, liveLocations.latest)) liveLocations.latest = latest;
  } catch {
    /* leave previous state if the daemon hiccups */
  }
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function sameLatest(a: Map<number, LivePoint>, b: Map<number, LivePoint>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (!vb || vb.timestamp !== va.timestamp || vb.contactId !== va.contactId) {
      return false;
    }
  }
  return true;
}

onEvent('LocationChanged', () => void refreshLiveLocations());
// Slow ticker so streams drop out when their window expires. Skip when the
// window is hidden or no account is configured — both make the RPC + DB
// scan pure overhead.
setInterval(() => {
  if (typeof document !== 'undefined' && document.hidden) return;
  if (accounts.selectedId == null) return;
  void refreshLiveLocations();
}, TICK_MS);
