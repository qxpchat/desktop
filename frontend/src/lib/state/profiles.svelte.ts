// Per-account profile + unread metadata for pane 1's avatar rail.
// Refreshed on:
//   - boot (App.svelte calls refreshProfiles after refreshAccounts)
//   - AccountsChanged / AccountsItemChanged events
//   - IncomingMsg / MsgsChanged / MsgsNoticed / ChatlistChanged /
//     ChatlistItemChanged — to update fresh-msg counts

import { rpc } from '../rpc';
import { onEvent } from '../events';
import { applyAccountOrder } from '../prefs.svelte';

/** dc-core connectivity buckets — see `DC_CONNECTIVITY_*` in `deltachat.h`.
 *  Returned by `get_connectivity`. Higher = healthier.
 *  1000 NOT_CONNECTED · 2000 CONNECTING · 3000 WORKING · 4000 CONNECTED. */
export const CONNECTIVITY = {
  NotConnected: 1000,
  Connecting: 2000,
  Working: 3000,
  Connected: 4000,
} as const;

export type Profile = {
  id: number;
  displayName: string;
  addr: string;
  color: string;
  profileImage: string | null;
  privateTag: string | null;
  freshCount: number;
  /** Latest dc-core connectivity bucket for this account. See `CONNECTIVITY`. */
  connectivity: number;
};

export const profiles = $state<{ list: Profile[] }>({ list: [] });

// freshCount mirrors the sum of per-row badges the user sees inside that
// profile's inbox chatlist (`freshMessageCounter` summed across entries).
// `get_fresh_msgs` is the wrong source: it deliberately excludes contact
// requests and muted chats, so a fresh DM from another profile landing as
// an unaccepted request leaves the count at 0.
//
// Always queried against the inbox listing (no archived-only flag, no
// search filter) so the count never depends on what the chatlist pane is
// currently showing — earlier this summed the live `chatlist` mirror for
// the active account, which made `freshCount` reflect the archive-only or
// search-filtered view and drift out of sync with the inbox.
//
// Only `ChatListItem` entries count. The `ArchiveLink` sentinel carries
// its own `freshMessageCounter` (the archived-chat total), but archived
// chats sit behind the archive link with no per-row badge — folding it in
// lit the macOS dock badge with nothing in-app to match it.
async function computeFreshCount(accountId: number): Promise<number> {
  const ids = await rpc.call<number[]>('get_chatlist_entries', [accountId, null, null, null]);
  if (ids.length === 0) return 0;
  const entries = await rpc.call<
    Record<number, { kind?: string; freshMessageCounter?: number }>
  >('get_chatlist_items_by_entries', [accountId, ids]);
  let count = 0;
  for (const id of ids) {
    const e = entries[id];
    if (e && e.kind === 'ChatListItem') count += e.freshMessageCounter ?? 0;
  }
  return count;
}

export async function refreshProfiles(ids: number[]): Promise<void> {
  const out: Profile[] = [];
  for (const id of ids) {
    try {
      // Wire tag is PascalCase: rust enum `Account` uses `#[serde(tag = "kind")]`
      // without enum-level `rename_all`, so variants pass through as
      // `Configured` / `Unconfigured`.
      const info = await rpc.call<
        | {
            kind: 'Configured';
            id: number;
            displayName: string | null;
            addr: string | null;
            profileImage: string | null;
            color: string;
            privateTag: string | null;
          }
        | { kind: 'Unconfigured'; id: number }
      >('get_account_info', [id]);
      if (info.kind !== 'Configured') continue;
      let freshCount: number;
      try {
        freshCount = await computeFreshCount(id);
      } catch {
        // Preserve the prior count on transient RPC failure — wiping to 0
        // hides legitimately unread messages from the profile rail.
        freshCount = profiles.list.find((p) => p.id === id)?.freshCount ?? 0;
      }
      let connectivity: number;
      try {
        connectivity = await rpc.call<number>('get_connectivity', [id]);
      } catch {
        connectivity =
          profiles.list.find((p) => p.id === id)?.connectivity ??
          CONNECTIVITY.NotConnected;
      }
      out.push({
        id: info.id,
        displayName: info.displayName ?? info.addr ?? `Account ${info.id}`,
        addr: info.addr ?? '',
        color: info.color,
        profileImage: info.profileImage,
        privateTag: info.privateTag,
        freshCount,
        connectivity,
      });
    } catch {
      /* skip; account may have just been removed */
    }
  }
  profiles.list = applyAccountOrder(out);
}

async function patchFresh(accountId: number) {
  if (!profiles.list.some((p) => p.id === accountId)) return;
  try {
    const freshCount = await computeFreshCount(accountId);
    // Reassign the whole list (rather than `list[idx] = …`) so the each
    // block on `profiles.list` re-renders the affected tile. With
    // index-assignment, the inactive-profile badge updated only on the next
    // full refresh (account switch), not on the IncomingMsg-driven event.
    profiles.list = profiles.list.map((p) =>
      p.id === accountId ? { ...p, freshCount } : p,
    );
  } catch {
    /* skip — keep prior count */
  }
}

/** Recompute freshCount for every known profile. Used when the active
 *  account changes — the just-deselected profile's count would otherwise
 *  only re-tally on the next DC event for it. */
export async function recomputeAllFreshCounts(): Promise<void> {
  const ids = profiles.list.map((p) => p.id);
  await Promise.all(ids.map((id) => patchFresh(id)));
}

// Five event kinds fan out the same "freshCount for this account may have
// moved" signal. Coalesce per-account so one arriving message triggers one
// RPC pair instead of five.
const dirtyAccounts = new Set<number>();
let drainScheduled = false;
function markFreshDirty(accountId: number): void {
  dirtyAccounts.add(accountId);
  if (drainScheduled) return;
  drainScheduled = true;
  queueMicrotask(() => {
    drainScheduled = false;
    const ids = Array.from(dirtyAccounts);
    dirtyAccounts.clear();
    for (const id of ids) void patchFresh(id);
  });
}

onEvent('IncomingMsg', (ev) => markFreshDirty(ev.contextId));
onEvent('MsgsNoticed', (ev) => markFreshDirty(ev.contextId));
onEvent('MsgsChanged', (ev) => markFreshDirty(ev.contextId));
onEvent('ChatlistChanged', (ev) => markFreshDirty(ev.contextId));
onEvent('ChatlistItemChanged', (ev) => markFreshDirty(ev.contextId));

async function patchConnectivity(accountId: number): Promise<void> {
  if (!profiles.list.some((p) => p.id === accountId)) return;
  try {
    const connectivity = await rpc.call<number>('get_connectivity', [accountId]);
    profiles.list = profiles.list.map((p) =>
      p.id === accountId ? { ...p, connectivity } : p,
    );
  } catch {
    /* skip — keep prior value */
  }
}

onEvent('ConnectivityChanged', (ev) => void patchConnectivity(ev.contextId));
