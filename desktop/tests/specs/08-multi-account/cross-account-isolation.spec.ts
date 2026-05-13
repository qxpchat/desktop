// Phase 8 — cross-account isolation.
//
// Stronger version of the switch spec: after adding a second account,
// send a message from peer to main, see it land under account A,
// switch to account B → the row + bubble must NOT appear there. This
// catches a class of leak bugs where the chatlist subscribes to events
// across accounts.

import { test, expect } from '../../fixtures/app-paired.js';
import { waitForChatRowByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

async function provisionSecondAccount(rpc: { call<T>(method: string, params?: unknown[]): Promise<T> }, displayName: string): Promise<number> {
  // Preserve the active account — dc-core's add_account auto-selects
  // the new id, which would silently flip the UI away from main.
  const prevSelected = await rpc.call<number | null>('get_selected_account_id');
  const id = await rpc.call<number>('add_account');
  await rpc.call('set_config', [id, 'displayname', displayName]);
  await rpc.call('set_config_from_qr', [id, 'dcaccount:nine.testrun.org']);
  await rpc.call('configure', [id]);
  if (prevSelected != null) await rpc.call('select_account', [prevSelected]);
  return id;
}

test('chat on account A does not surface under account B', async ({ qxpPaired, page }) => {
  const { peer, mainRpc } = qxpPaired;

  // Peer sends to account A first — let that round-trip settle before
  // we start a configure on a second account (the configure call also
  // grabs IMAP+SMTP and the two operations can starve each other on
  // chatmail).
  await peer.sendTo('hi A, leaking to B?');
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);

  // Now provision account B and wait for the AccountsChanged → refresh
  // pipeline to surface the new tile in NavTabs.
  const secondId = await provisionSecondAccount(mainRpc, 'Isolated');
  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 30_000 });

  // Switch to B.
  await page.locator(TID.navTabsAccountById(secondId)).click();

  // Account B's chatlist must not show peer's row.
  await expect(
    page.locator(`[data-testid="chat-list-row"][data-name="${peer.displayName}"]`),
  ).toHaveCount(0);

  // And the bubble (if any chat were open) shouldn't be in the DOM either.
  await expect(
    page.locator(`[data-testid="message-bubble"]`, { hasText: 'hi A, leaking to B?' }),
  ).toHaveCount(0);
});
