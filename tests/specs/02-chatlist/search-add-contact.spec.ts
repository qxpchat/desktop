// Phase 2 — add contact / join from search (T043 / CHATLIST-016).
//
// When the chat-list search query is an email with no existing chat, a
// synthetic "New chat with <addr>" result lets the user start a 1:1 in one
// click (create_contact + open). When it's an invite link/QR, a "Join via
// invite" result routes to the QR dispatcher's secure-join pipeline. Mirrors
// the reference's `addContactOnClick`.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('typing an email surfaces a synthetic result that opens a 1:1 chat', async ({
  qxpPaired,
  page,
}) => {
  const addr = `someone-${Date.now()}@example.org`;

  await page.locator(TID.chatListSearch).fill(addr);

  // No existing chat matches → the synthetic "new chat" item appears (and the
  // generic "no match" empty state is suppressed).
  const item = page.locator(TID.chatListSearchNewEmail);
  await expect(item).toBeVisible();
  await expect(item).toContainText(addr);
  await expect(page.locator(TID.chatListEmpty)).toHaveCount(0);

  // Click → create_contact + create_chat_by_contact_id + open. The chat that
  // opens is backed by the new contact: its title is the address (the
  // contact's name), which proves the contact was created. Search clears.
  await item.click();
  await expect(
    page.locator(TID.chatTopbarTitle).filter({ hasText: addr }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(TID.chatListSearch)).toHaveValue('');
});

test('typing an invite link surfaces a Join-via-invite result that opens the QR dispatcher', async ({
  page,
}) => {
  // A well-formed-looking invite URL — enough to match the invite pattern and
  // route to the dispatcher. (Completing secure-join needs a real peer invite,
  // out of scope here; we assert the routing.)
  await page
    .locator(TID.chatListSearch)
    .fill('https://i.delta.chat/#0000000000000000000000000000000000000000&a=x%40y.z&n=X&i=AAA&s=BBB');

  const item = page.locator(TID.chatListSearchJoinInvite);
  await expect(item).toBeVisible();

  await item.click();
  await expect(page.locator(TID.qrDispatcher)).toBeVisible({ timeout: 10_000 });
});
