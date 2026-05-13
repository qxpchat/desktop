// Phase 2 — chat list search.
//
// Two peers seed two chats. Typing one peer's display name into the
// search box should leave exactly that row in the list.

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

test('search filters the chat list by display name', async ({ qxpPaired, page }) => {
  const alice = qxpPaired.peer;
  const mainEmail = qxpPaired.mainAccount.email;

  leased = await leaseAccounts(1);
  const bobAcct = leased[0];
  bob = await spawnPeer(BOB_PORT, bobAcct);
  await pairPeerWithMain(bob);

  await alice.sendTo('hi');
  await bob.sendTo(mainEmail, 'hi');
  await waitForChatRowByName(page, alice.displayName, ARRIVAL_TIMEOUT_MS);
  await waitForChatRowByName(page, bobAcct.displayName, ARRIVAL_TIMEOUT_MS);

  const search = page.locator(TID.chatListSearch);
  const aliceRow = page.locator(
    `[data-testid="chat-list-row"][data-name="${alice.displayName}"]`,
  );
  const bobRow = page.locator(
    `[data-testid="chat-list-row"][data-name="${bobAcct.displayName}"]`,
  );
  const rows = page.locator(`${TID.chatList} [data-testid="chat-list-row"]`);

  await search.fill(alice.displayName);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-name', alice.displayName);

  await search.fill('');
  await expect(aliceRow).toBeVisible();
  await expect(bobRow).toBeVisible();
});
