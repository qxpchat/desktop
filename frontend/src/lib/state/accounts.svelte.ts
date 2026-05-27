// Account state — what configured accounts exist, which one is selected, and
// any half-configured accounts that need cleaning up after an interrupted
// onboarding.

import { rpc } from '../rpc';
import { onEvent } from '../events';

export type AccountsState = {
  loaded: boolean;
  /** All account IDs the daemon knows about, configured or not. */
  ids: number[];
  /** Subset of `ids` that are fully configured (passed `is_configured`). */
  configuredIds: number[];
  /** Selected account id (only meaningful when present in `configuredIds`). */
  selectedId: number | null;
  /** `is_chatmail` config of the selected account. `null` until resolved.
   *  Chatmail accounts can't send plain (unencrypted) email — the relays
   *  reject outbound non-E2EE traffic — so the "New Email" entry only
   *  shows for classic email-based accounts. */
  selectedIsChatmail: boolean | null;
};

export const accounts = $state<AccountsState>({
  loaded: false,
  ids: [],
  configuredIds: [],
  selectedId: null,
  selectedIsChatmail: null,
});

export async function refreshAccounts(): Promise<void> {
  try {
    const ids = await rpc.call<number[]>('get_all_account_ids');
    const configuredIds: number[] = [];
    for (const id of ids) {
      try {
        const ok = await rpc.call<boolean>('is_configured', [id]);
        if (ok) configuredIds.push(id);
      } catch {
        /* skip — leave out of configuredIds */
      }
    }
    let selectedId: number | null = null;
    if (configuredIds.length > 0) {
      const sel = await rpc.call<number | null>('get_selected_account_id');
      selectedId =
        sel != null && configuredIds.includes(sel) ? sel : (configuredIds[0] ?? null);
    }
    accounts.ids = ids;
    accounts.configuredIds = configuredIds;
    accounts.selectedId = selectedId;
    if (selectedId != null) {
      try {
        const v = await rpc.call<string | null>('get_config', [selectedId, 'is_chatmail']);
        accounts.selectedIsChatmail = v === '1';
      } catch {
        accounts.selectedIsChatmail = null;
      }
    } else {
      accounts.selectedIsChatmail = null;
    }
  } catch (err) {
    // Leave the previously-rendered list in place on transient failure —
    // wiping it on every refresh hiccup turns a brief daemon stall into a
    // visible "no accounts" boot screen.
    console.error('refreshAccounts failed', err);
  } finally {
    accounts.loaded = true;
  }
}

// dc-core splits account-list mutations across two events:
//   - `AccountsChanged`     fires on add_account / remove_account
//                           (account *list* shape changed).
//   - `AccountsItemChanged` fires on configure-complete / set_config
//                           (an existing account's metadata changed
//                            — most importantly the `is_configured`
//                            flag flipping from false to true).
//
// We need both: AccountsChanged so a new tile appears, and
// AccountsItemChanged so a freshly-configured account moves into
// `configuredIds` (which is what NavTabs renders).
onEvent('AccountsChanged', () => void refreshAccounts());
onEvent('AccountsItemChanged', () => void refreshAccounts());

/** Remove any accounts that aren't yet configured — typically left over from
 *  an onboarding flow that was interrupted (tab closed, network dropped). */
export async function purgeUnconfigured(): Promise<void> {
  const stale = accounts.ids.filter((id) => !accounts.configuredIds.includes(id));
  for (const id of stale) {
    try {
      await rpc.call('remove_account', [id]);
    } catch {
      /* best-effort */
    }
  }
  if (stale.length > 0) await refreshAccounts();
}
