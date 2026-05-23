// Phase 8 — per-account connectivity icon (T003 / ACCT-002.3).
//
// `NavTabs.svelte` shows one connectivity icon in the footer above the
// proxy shield. It tracks the *selected* profile's dc-core connectivity
// (sourced from `get_connectivity` and refreshed on every
// `ConnectivityChanged` event in `profiles.svelte.ts`). Three buckets:
// connected (default tint), connecting (yellow), offline (red).
//
// Coverage: stop_io on the templated account, assert the icon flips to
// `offline`; start_io again, assert it returns to `connected`. A second
// account is provisioned + selected mid-test to prove the icon is keyed
// on the *selected* profile, not a global state.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(180_000);

async function provisionSecondAccount(
  rpc: { call<T>(method: string, params?: unknown[]): Promise<T> },
  displayName: string,
): Promise<number> {
  const prevSelected = await rpc.call<number | null>('get_selected_account_id');
  const id = await rpc.call<number>('add_account');
  await rpc.call('set_config', [id, 'displayname', displayName]);
  await rpc.call('set_config_from_qr', [id, 'dcaccount:nine.testrun.org']);
  await rpc.call('configure', [id]);
  if (prevSelected != null) await rpc.call('select_account', [prevSelected]);
  return id;
}

test('connectivity icon reflects selected-account dc-core state', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;

  const firstId = await mainRpc.call<number>('get_selected_account_id') as number;
  const secondId = await provisionSecondAccount(mainRpc, 'Second');

  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  // First account is selected. Wait for IO to converge → connected.
  await expect(page.locator(TID.navTabsConnectivity))
    .toHaveAttribute('data-conn-state', 'connected', { timeout: 60_000 });

  // Stop IO on the *selected* account → icon flips offline.
  await mainRpc.call('stop_io', [firstId]);
  await expect(page.locator(TID.navTabsConnectivity))
    .toHaveAttribute('data-conn-state', 'offline', { timeout: 30_000 });

  // Switch to the second account → icon should reflect *its* (still-on) IO,
  // not the first account's stopped state. Proves the icon is keyed on the
  // selected profile.
  await page.locator(TID.navTabsAccountById(secondId)).click();
  await expect(page.locator(TID.navTabsConnectivity))
    .toHaveAttribute('data-conn-state', 'connected', { timeout: 60_000 });

  // Restart IO on the first account so the templated state is restored
  // before the next test in this phase folder picks up the pool slot.
  await mainRpc.call('start_io', [firstId]);
});
