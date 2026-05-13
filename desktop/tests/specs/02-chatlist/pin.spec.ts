// Phase 2 — pin / unpin.
//
// Pinned chats sort above unpinned ones regardless of last-message
// timestamp. We seed Alice (older) and Bob (newer) so the natural order
// is [Bob, Alice]; pinning Alice should flip it to [Alice, Bob] and
// unpinning should restore the original order.

import { test, expect } from '../../fixtures/app-paired.js';
import { leaseAccounts, releaseAccounts, type PoolAccount } from '../../fixtures/accounts.js';
import {
  pairPeerWithMain,
  spawnPeer,
  waitForChatRowByName,
  type Peer,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(180_000);

const BOB_PORT = 9043;

let leased: PoolAccount[] = [];
let bob: Peer | null = null;

test.afterEach(async () => {
  await bob?.cleanup();
  bob = null;
  releaseAccounts(leased);
  leased = [];
});

test('pin lifts a row to the top; unpin restores order', async ({ qxpPaired, page }) => {
  const alice = qxpPaired.peer;
  const mainEmail = qxpPaired.mainAccount.email;

  leased = await leaseAccounts(1);
  const bobAcct = leased[0];
  bob = await spawnPeer(BOB_PORT, bobAcct);
  await pairPeerWithMain(bob);

  await alice.sendTo('older');
  await waitForChatRowByName(page, alice.displayName, ARRIVAL_TIMEOUT_MS);
  await new Promise((r) => setTimeout(r, 3_000));
  await bob.sendTo(mainEmail, 'newer');
  await waitForChatRowByName(page, bobAcct.displayName, ARRIVAL_TIMEOUT_MS);

  const rows = page.locator(`${TID.chatList} [data-testid="chat-list-row"]`);
  // Natural order — Bob (newer) on top.
  await expect(rows.first()).toHaveAttribute('data-name', bobAcct.displayName);

  // Right-click Alice → Pin.
  const aliceRow = page.locator(
    `[data-testid="chat-list-row"][data-name="${alice.displayName}"]`,
  );
  await aliceRow.click({ button: 'right' });
  await expect(page.locator(TID.chatRowMenu)).toBeVisible();
  await page.locator(TID.chatRowMenuItem('pin')).click();

  // Alice now on top.
  await expect(rows.first()).toHaveAttribute('data-name', alice.displayName);

  // Unpin → Bob back on top.
  await aliceRow.click({ button: 'right' });
  await page.locator(TID.chatRowMenuItem('unpin')).click();
  await expect(rows.first()).toHaveAttribute('data-name', bobAcct.displayName);
});
