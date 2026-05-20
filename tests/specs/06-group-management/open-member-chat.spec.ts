// Phase 6 — clicking a member row in a group's chat-info opens the
// 1:1 chat with that contact. Regression: previously the member row
// was a static `<li>` with no click affordance, so the only way to
// start a DM with a group member was to leave the group, search the
// chat list, and open them there.

import { test, expect } from '../../fixtures/app-paired.js';
import { createGroupAndOpenInfo } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('open-member-chat: clicking a group member opens the 1:1 chat', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await createGroupAndOpenInfo(page, peer.displayName, `Open mem ${Date.now()}`);

  const peerRow = page.locator(TID.chatInfoMemberByName(peer.displayName));
  await expect(peerRow).toBeVisible();
  await peerRow.locator(TID.chatInfoMemberOpen).click();

  // ChatInfo dismisses (back to chat route) and the topbar now shows
  // the peer's 1:1 chat, not the group.
  await expect(page.locator(TID.chatInfo)).toHaveCount(0);
  await expect(
    page.locator(TID.chatTopbarTitle).filter({ hasText: peer.displayName }),
  ).toBeVisible({ timeout: 10_000 });
});
