// Phase 8 — restore last-used account on startup (T007 / ACCT-006).
//
// `App.svelte` calls `select_account` whenever the user clicks a tile;
// dc-core persists that selection. On boot, `refreshAccounts` reads it
// back via `get_selected_account_id` and seeds `accounts.selectedId` from
// it (`lib/state/accounts.svelte.ts`). This test confirms the round-trip:
// pick a non-template account, reload the SPA, and assert that the
// previously-selected tile is still selected — without any user action.

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

test('selected account survives a reload', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;

  const firstId = await mainRpc.call<number>('get_selected_account_id') as number;
  const secondId = await provisionSecondAccount(mainRpc, 'Second');

  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  // Initial selection = the templated account.
  await expect(page.locator(TID.navTabsAccountById(firstId)))
    .toHaveAttribute('aria-pressed', 'true');

  // Switch to the second account.
  await page.locator(TID.navTabsAccountById(secondId)).click();
  await expect(page.locator(TID.navTabsAccountById(secondId)))
    .toHaveAttribute('aria-pressed', 'true');

  // Reload the SPA — same as relaunching the app. The daemon stays up
  // (Vite dev server / Tauri webview), but `App.svelte`'s `onMount` and
  // `refreshAccounts` run from scratch. localStorage persists, so the
  // rail's open/closed state survives — no need to click the burger again.
  await page.reload();

  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator(TID.navTabsAccountById(secondId)))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
});
