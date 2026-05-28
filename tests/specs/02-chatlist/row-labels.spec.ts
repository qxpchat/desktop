// Phase 2 — in-row pills for contact-request and archived chats
// (T036 / CHATLIST-007).
//
// `ChatListRow.svelte` renders a "Request" pill on unaccepted
// contact-request rows (replacing the fresh-counter + delivery glyph),
// and an "Archived" pill on archived rows that surface outside the
// dedicated archive view (e.g. in search results). The archive view
// suppresses the pill — every row there is archived, so it's noise.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  leaseAccounts,
  releaseAccounts,
  type PoolAccount,
} from '../../fixtures/accounts.js';
import {
  spawnPeer,
  waitForChatRowByName,
  type Peer,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(300_000);

const TEMP_PORT = 9044;

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

test('contact-request row shows a Request pill until accepted', async ({
  qxpPaired,
  page,
}) => {
  // A fresh stranger A messages B (the app-under-test). To get a genuine
  // contact request and not a bounced plaintext mail, A first imports B's
  // public key (self vCard) so the opening message goes out encrypted.
  leased = await leaseAccounts(1);
  peer = await spawnPeer(TEMP_PORT, leased[0]);

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

  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  const row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer.displayName}"]`,
  );

  // Request pill present; the unread badge is suppressed in its place.
  await expect(row.locator(TID.chatListRowRequest)).toBeVisible();
  await expect(row.locator(TID.chatListRowUnread)).toHaveCount(0);

  // Accept the request → pill clears (chat becomes a normal accepted chat).
  await row.click();
  await page.locator(TID.contactRequestBarAccept).click();
  await expect(row.locator(TID.chatListRowRequest)).toHaveCount(0, {
    timeout: 10_000,
  });
});

test('archived row shows an Archived pill in search but not in the archive view', async ({
  qxpPaired,
  page,
}) => {
  // Use a traffic-free local group rather than the live paired chat:
  // dc-core auto-unarchives any archived non-muted chat the moment a new
  // message lands in it, so a chat with a live peer + IMAP polling races
  // the assertion (the chat silently un-archives → is_archived flips
  // false → no pill). An empty self-group never receives mail, so its
  // archived state is stable.
  const accountId = (await qxpPaired.mainRpc.call<number[]>('get_all_account_ids'))[0];
  const name = `Archive Probe ${Date.now()}`;
  const groupId = await qxpPaired.mainRpc.call<number>('create_group_chat', [
    accountId,
    name,
    false,
  ]);

  await waitForChatRowByName(page, name, ARRIVAL_TIMEOUT_MS);
  const row = page.locator(`[data-testid="chat-list-row"][data-name="${name}"]`);

  // Archive it; it drops out of the inbox list.
  await qxpPaired.mainRpc.call('set_chat_visibility', [accountId, groupId, 'Archived']);
  await expect(row).toHaveCount(0);

  // In the dedicated archive view the pill is suppressed (every row is
  // archived there → noise).
  await page.locator(TID.chatListArchiveLink).click();
  await expect(row).toBeVisible();
  await expect(row.locator(TID.chatListRowArchived)).toHaveCount(0);
  await page.locator(TID.chatListArchiveBack).click();

  // Search from the inbox surfaces the archived chat — here the pill
  // earns its keep, flagging that the hit is an archived conversation.
  await page.locator(TID.chatListSearch).fill(name);
  await expect(row).toBeVisible();
  await expect(row.locator(TID.chatListRowArchived)).toBeVisible();
});
