// Phase 2 — chat list, load & sort.
//
// Alice (from the paired template) and a second peer Bob send a message
// to the main user, ~3s apart. The chat list should sort by most-recent
// last-message timestamp → Bob's row first.
//
// Alice is pre-paired via the qxpPaired fixture (cheap). Bob is leased
// from an unused pool slot and live-paired with main — one handshake
// instead of two, which is the price 2-peer specs pay for not having a
// trio template yet.

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

test('chat list shows incoming chats sorted newest-first', async ({ qxpPaired, page }) => {
  const alice = qxpPaired.peer;
  const mainEmail = qxpPaired.mainAccount.email;

  // Lease a second account (not in any pair template) and live-pair
  // it with main.
  leased = await leaseAccounts(1);
  const bobAcct = leased[0];
  bob = await spawnPeer(BOB_PORT, bobAcct);
  await pairPeerWithMain(bob);

  await alice.sendTo('hello from alice');
  await waitForChatRowByName(page, alice.displayName, ARRIVAL_TIMEOUT_MS);

  // Wallclock gap so Bob's last-message timestamp is strictly newer.
  await new Promise((r) => setTimeout(r, 3_000));
  await bob.sendTo(mainEmail, 'hello from bob');
  await waitForChatRowByName(page, bobAcct.displayName, ARRIVAL_TIMEOUT_MS);

  // Saved Messages / Device Messages live in the list too but with
  // older timestamps — we only assert that Bob is above Alice.
  const rows = page.locator(`${TID.chatList} [data-testid="chat-list-row"]`);
  await expect(rows.first()).toHaveAttribute('data-name', bobAcct.displayName);
  await expect(rows.nth(1)).toHaveAttribute('data-name', alice.displayName);
});
