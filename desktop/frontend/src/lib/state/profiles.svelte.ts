// Per-account profile + unread metadata for pane 1's avatar rail.
// Refreshed on:
//   - boot (App.svelte calls refreshProfiles after refreshAccounts)
//   - AccountsChanged / AccountsItemChanged events
//   - IncomingMsg / MsgsChanged / MsgsNoticed / ChatlistChanged /
//     ChatlistItemChanged — to update fresh-msg counts

import { rpc } from '../rpc';
import { onEvent } from '../events';
import { chatlist } from './chatlist.svelte';

export type Profile = {
  id: number;
  displayName: string;
  addr: string;
  color: string;
  profileImage: string | null;
  privateTag: string | null;
  freshCount: number;
};

export const profiles = $state<{ list: Profile[] }>({ list: [] });

// freshCount mirrors the sum of per-row badges the user sees inside that
// profile's chatlist (i.e. `freshMessageCounter` summed across entries).
// `get_fresh_msgs` is the wrong source: it deliberately excludes contact
// requests and muted chats, so a fresh DM from another profile landing as
// an unaccepted request leaves the count at 0.
async function computeFreshCount(accountId: number): Promise<number> {
  // Active account: chatlist already keeps a live mirror of the same
  // per-row counts. Sum from there instead of issuing the same RPC pair.
  if (accountId === chatlist.accountId) {
    let count = 0;
    for (const item of chatlist.items.values()) count += item.freshMessageCounter;
    return count;
  }
  const ids = await rpc.call<number[]>('get_chatlist_entries', [accountId, null, null, null]);
  if (ids.length === 0) return 0;
  const entries = await rpc.call<
    Record<number, { kind?: string; freshMessageCounter?: number }>
  >('get_chatlist_items_by_entries', [accountId, ids]);
  let count = 0;
  for (const id of ids) {
    const e = entries[id];
    if (e) count += e.freshMessageCounter ?? 0;
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
      out.push({
        id: info.id,
        displayName: info.displayName ?? info.addr ?? `Account ${info.id}`,
        addr: info.addr ?? '',
        color: info.color,
        profileImage: info.profileImage,
        privateTag: info.privateTag,
        freshCount,
      });
    } catch {
      /* skip; account may have just been removed */
    }
  }
  profiles.list = out;
}

async function patchFresh(accountId: number) {
  if (!profiles.list.some((p) => p.id === accountId)) return;
  try {
    const freshCount = await computeFreshCount(accountId);
    const idx = profiles.list.findIndex((p) => p.id === accountId);
    if (idx < 0) return;
    profiles.list[idx] = { ...profiles.list[idx], freshCount };
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
