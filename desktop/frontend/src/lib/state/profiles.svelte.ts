// Per-account profile + unread metadata for pane 1's avatar rail.
// Refreshed on:
//   - boot (App.svelte calls refreshProfiles after refreshAccounts)
//   - AccountsChanged / AccountsItemChanged events
//   - IncomingMsg / MsgsChanged / MsgsNoticed / ChatlistChanged /
//     ChatlistItemChanged — to update fresh-msg counts

import { rpc } from '../rpc';
import { onEvent } from '../events';

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
      let freshCount = 0;
      try {
        freshCount = await computeFreshCount(id);
      } catch {
        /* skip */
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
    const next = profiles.list.slice();
    next[idx] = { ...next[idx], freshCount };
    profiles.list = next;
  } catch {
    /* skip */
  }
}

/** Recompute freshCount for every known profile. Used when the active
 *  account changes — the just-deselected profile's count would otherwise
 *  only re-tally on the next DC event for it. */
export async function recomputeAllFreshCounts(): Promise<void> {
  const ids = profiles.list.map((p) => p.id);
  await Promise.all(ids.map((id) => patchFresh(id)));
}

onEvent('IncomingMsg', (ev) => void patchFresh(ev.contextId));
onEvent('MsgsNoticed', (ev) => void patchFresh(ev.contextId));
onEvent('MsgsChanged', (ev) => void patchFresh(ev.contextId));
onEvent('ChatlistChanged', (ev) => void patchFresh(ev.contextId));
onEvent('ChatlistItemChanged', (ev) => void patchFresh(ev.contextId));
