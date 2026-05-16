// Phase 3 — contact request (first message from an unknown contact).
//
// When account A messages B for the first time, deltachat-core files the
// chat as `Blocked::Request`. `prepare_send_msg` then refuses every send
// ("Cannot send to … Contact request") — so B must Accept the request
// before the composer works. qxp used to render the composer regardless;
// B's send threw and the message silently vanished.
//
// Setup: B is the app-under-test (paired-template main). A is a fresh
// leased pool slot on a temp daemon that has never contacted B. To get a
// genuine contact request — and not a plaintext mail that chatmail's
// `filtermail` policy bounces between strangers — A first imports B's
// vCard (B's public key), so its opening message goes out encrypted.
// B never approved A, so B files it as a request.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  leaseAccounts,
  releaseAccounts,
  type PoolAccount,
} from '../../fixtures/accounts.js';
import { spawnPeer, waitForChatRowByName, openChatByName, type Peer } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(300_000);

const TEMP_PORT = 9043;

let leased: PoolAccount[] = [];
let peer: Peer | null = null;

test.afterEach(async () => {
  if (peer) {
    await peer.cleanup();
    peer = null;
  }
  releaseAccounts(leased);
  leased = [];
});

test('contact request: B must accept before replying to a first-time sender', async ({
  qxpPaired,
  page,
}) => {
  // Account A — a fresh slot that has never contacted B.
  leased = await leaseAccounts(1);
  peer = await spawnPeer(TEMP_PORT, leased[0]);

  // Hand A account B's public key (self-contact vCard) so the opening
  // message is encrypted — chatmail rejects plaintext between strangers.
  const bAccountId = (await qxpPaired.mainRpc.call<number[]>('get_all_account_ids'))[0];
  const bVcard = await qxpPaired.mainRpc.call<string>('make_vcard', [bAccountId, [1]]);
  const [bContactId] = await peer.daemon.rpc.call<number[]>('import_vcard_contents', [
    peer.accountId,
    bVcard,
  ]);
  const aChatId = await peer.daemon.rpc.call<number>('create_chat_by_contact_id', [
    peer.accountId,
    bContactId,
  ]);
  await peer.daemon.rpc.call('misc_send_text_message', [
    peer.accountId,
    aChatId,
    'hello from a stranger',
  ]);

  // B's chatlist gains a row for A once the message arrives over IMAP.
  await waitForChatRowByName(page, peer.displayName);
  await openChatByName(page, peer.displayName);

  // The incoming message is visible, but the composer is replaced by the
  // accept/decline bar — B can't send yet.
  await expect(
    page
      .locator('[data-testid="message-bubble"][data-direction="incoming"]')
      .filter({ hasText: 'hello from a stranger' }),
  ).toBeVisible();
  await expect(page.locator(TID.contactRequestBar)).toBeVisible();
  await expect(page.locator(TID.composer)).toHaveCount(0);

  // Accept → request bar goes away, composer returns.
  await page.locator(TID.contactRequestBarAccept).click();
  await expect(page.locator(TID.composer)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(TID.contactRequestBar)).toHaveCount(0);

  // The bug: before accepting, this send threw and nothing happened. Now
  // it goes through to `delivered`.
  await page.locator(TID.composerTextarea).fill('hi back');
  await page.locator(TID.composerSend).click();
  const outgoing = page
    .locator('[data-testid="message-bubble"][data-direction="outgoing"]')
    .filter({ hasText: 'hi back' })
    .first();
  await expect(outgoing).toBeVisible({ timeout: 10_000 });
  await expect(outgoing).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });
});
