// Phase 8 — mark all of an account's chats as read (T010 / ACCT-009).
//
// Right-click a profile tile → "Mark all as read" → calls dc-core's
// `marknoticed_all_chats(accountId)`. Every fresh message in that
// account's chats is marked noticed, freshCount drops to 0, badge clears
// in the rail. Test drives the action while the *other* account is
// selected so we hit the off-screen / inactive path (the common case
// that motivates the feature).

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

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

test('mark all account chats as read clears the rail badge', async ({ qxpPaired, page }) => {
  const { peer, mainRpc } = qxpPaired;

  const firstId = await mainRpc.call<number>('get_selected_account_id') as number;
  const secondId = await provisionSecondAccount(mainRpc, 'Second');

  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  // Switch to the second account so the first one is inactive — its
  // freshCount will appear as a corner badge when the peer sends in.
  await page.locator(TID.navTabsAccountById(secondId)).click();
  await expect(page.locator(TID.navTabsAccountBadgeById(firstId))).toHaveCount(0);

  // Peer sends to the first account → badge lights up on its tile.
  await peer.sendTo('unread one');
  await peer.sendTo('unread two');
  await expect(page.locator(TID.navTabsAccountBadgeById(firstId)))
    .toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Right-click → Mark all as read.
  await page.locator(TID.navTabsAccountById(firstId)).click({ button: 'right' });
  await page.locator(TID.navTabsAccountMenuMarkRead).click();

  // Badge clears once `MsgsNoticed` events propagate through to
  // `profiles.svelte.ts → patchFresh`.
  await expect(page.locator(TID.navTabsAccountBadgeById(firstId)))
    .toHaveCount(0, { timeout: 10_000 });
});
