// Per-account profile + unread metadata for pane 1's avatar rail.
// Refreshed on:
//   - boot (App.svelte calls refreshProfiles after refreshAccounts)
//   - AccountsChanged / AccountsItemChanged events
//   - IncomingMsg / MsgsChanged / MsgsNoticed (any) — to update fresh-msg counts

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
        const fresh = await rpc.call<number[]>('get_fresh_msgs', [id]);
        freshCount = fresh.length;
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
  const idx = profiles.list.findIndex((p) => p.id === accountId);
  if (idx < 0) return;
  try {
    const fresh = await rpc.call<number[]>('get_fresh_msgs', [accountId]);
    const next = profiles.list.slice();
    next[idx] = { ...next[idx], freshCount: fresh.length };
    profiles.list = next;
  } catch {
    /* skip */
  }
}

onEvent('IncomingMsg', (ev) => void patchFresh(ev.contextId));
onEvent('MsgsNoticed', (ev) => void patchFresh(ev.contextId));
onEvent('MsgsChanged', (ev) => void patchFresh(ev.contextId));
