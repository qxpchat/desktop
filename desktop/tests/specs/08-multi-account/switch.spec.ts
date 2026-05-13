// Phase 8 — switch between accounts.
//
// Provision a second account via daemon RPC (avoids paying for a
// fresh-relay-registration in the UI on every run; the add-account UI
// flow is exercised by add-second-account.spec.ts). Click the second
// tile → chatlist swaps to the new account's chats (which is empty —
// the peer chat lives on the first account only).

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(120_000);

async function provisionSecondAccount(rpc: { call<T>(method: string, params?: unknown[]): Promise<T> }, displayName: string): Promise<number> {
  // dc-core's `add_account` auto-selects the new account (accounts.rs
  // calls `select_account(id)` inside `new_account`), which would
  // silently switch main's UI away from the templated account A.
  // Capture the previously-selected id and restore it so the caller's
  // chatlist stays on A.
  const prevSelected = await rpc.call<number | null>('get_selected_account_id');
  const id = await rpc.call<number>('add_account');
  await rpc.call('set_config', [id, 'displayname', displayName]);
  await rpc.call('set_config_from_qr', [id, 'dcaccount:nine.testrun.org']);
  await rpc.call('configure', [id]);
  if (prevSelected != null) await rpc.call('select_account', [prevSelected]);
  return id;
}

test('clicking the second account tile selects it; chatlist updates', async ({ qxpPaired, page }) => {
  const { peer, mainRpc } = qxpPaired;
  const secondId = await provisionSecondAccount(mainRpc, 'Second');

  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  // First account has the verified peer in its chatlist. The re-select
  // in `provisionSecondAccount` fires an AccountsItemChanged event;
  // the chatlist refetches A's chats async. Give it a beat.
  await expect(
    page.locator(`[data-testid="chat-list-row"][data-name="${peer.displayName}"]`),
  ).toBeVisible({ timeout: 15_000 });

  // Switch to the new account.
  await page.locator(TID.navTabsAccountById(secondId)).click();

  // The peer chat lives on account A only — it must not show under B.
  await expect(
    page.locator(`[data-testid="chat-list-row"][data-name="${peer.displayName}"]`),
  ).toHaveCount(0, { timeout: 10_000 });
});
