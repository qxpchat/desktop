// Phase 6 — leave a group via ChatInfo.
//
// Click Leave → confirm dialog → core sends the leave message + drops
// self from `selfInGroup`. The route navigates back to "no selected
// chat" (selectChat(null)), so the chat-shell empty state appears.

import { test, expect } from '../../fixtures/app-paired.js';
import { createGroupAndOpenInfo } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('leave: confirms the dialog, navigates out of the chat', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  page.on('dialog', (d) => void d.accept());

  const groupName = `Bye ${Date.now()}`;
  await createGroupAndOpenInfo(page, peer.displayName, groupName);

  await page.locator(TID.chatInfoLeave).click();

  // ChatView no longer mounts for this chat (selectChat(null) ran), so
  // the topbar with this group's title disappears.
  await expect(
    page.locator(TID.chatTopbarTitle).filter({ hasText: groupName }),
  ).toHaveCount(0);
});
