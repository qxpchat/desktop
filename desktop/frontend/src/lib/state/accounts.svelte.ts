// Account state — what configured accounts exist, which one is selected, and
// any half-configured accounts that need cleaning up after an interrupted
// onboarding.

import { rpc } from '../rpc';

export type AccountsState = {
  loaded: boolean;
  /** All account IDs the daemon knows about, configured or not. */
  ids: number[];
  /** Subset of `ids` that are fully configured (passed `is_configured`). */
  configuredIds: number[];
  /** Selected account id (only meaningful when present in `configuredIds`). */
  selectedId: number | null;
};

export const accounts = $state<AccountsState>({
  loaded: false,
  ids: [],
  configuredIds: [],
  selectedId: null,
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
  } catch (err) {
    console.error('refreshAccounts failed', err);
    accounts.ids = [];
    accounts.configuredIds = [];
    accounts.selectedId = null;
  } finally {
    accounts.loaded = true;
  }
}

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
