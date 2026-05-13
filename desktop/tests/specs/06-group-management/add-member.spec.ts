// Phase 6 — add a member to an existing group.
//
// Uses the trio fixture so we have a 3rd verified peer (peer2) available
// to add. Flow:
//   1. Create a group with peer1.
//   2. Open chat-info → tap "Add members" → dialog opens.
//   3. Tap peer2's row → tap "Add".
//   4. Members list now lists peer2; daemon-side membership confirms it.

import { test, expect } from '../../fixtures/app-trio.js';
import { createGroupAndOpenInfo } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(90_000);

test('add-member: picker adds a verified contact to the group', async ({ qxpTrio, page }) => {
  const { peer1, peer2, mainRpc } = qxpTrio;

  const groupName = `Add member ${Date.now()}`;
  await createGroupAndOpenInfo(page, peer1.displayName, groupName);

  // peer2's row is initially absent.
  await expect(
    page.locator(TID.chatInfoMemberByName(peer2.displayName)),
  ).toHaveCount(0);

  // Open the picker. Address-based lookup is more reliable than display
  // name — the chatmail secure_join handshake doesn't always propagate
  // peer's `displayname` config into main's local contact record, so
  // `contact.displayName` may be empty when reading from a cold template.
  await page.locator(TID.chatInfoAddMember).click();
  await expect(page.locator(TID.chatInfoAddMemberDialog)).toBeVisible();
  const row = page.locator(TID.chatInfoAddMemberRowByAddress(peer2.email));
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.click();
  await page.locator(TID.chatInfoAddMemberConfirm).click();
  await expect(page.locator(TID.chatInfoAddMemberDialog)).toHaveCount(0);

  // Daemon-side: peer2's contactId is in the chat's contactIds.
  const accountId = (await mainRpc.call<number[]>('get_all_account_ids'))[0];
  const entries = await mainRpc.call<number[]>('get_chatlist_entries', [accountId, null, groupName, null]);
  const peerContactId = await mainRpc.call<number | null>('lookup_contact_id_by_addr', [accountId, peer2.email]);
  expect(peerContactId).not.toBeNull();
  const full = await mainRpc.call<{ contactIds: number[] }>('get_full_chat_by_id', [accountId, entries[0]]);
  expect(full.contactIds).toContain(peerContactId!);

  // UI: members list now contains peer2. Look up by contact-id rather
  // than display name for the same reason as above.
  await expect(
    page.locator(`[data-testid="chat-info__member"][data-contact-id="${peerContactId}"]`),
  ).toBeVisible({ timeout: 5_000 });
});
