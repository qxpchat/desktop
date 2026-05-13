// Phase 2 — archive / unarchive.
//
// Archiving a chat removes it from the inbox list and surfaces the
// "Archived chats" link (chatlist.hasArchive flips true). Following the
// link enters archive-pane mode where the archived row is visible.
// Right-click → Unarchive pulls it back to the inbox.

import { test, expect } from '../../fixtures/app-paired.js';
import { waitForChatRowByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(60_000);

test('archive moves a chat into the archive pane; unarchive restores it', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await peer.sendTo('archive me');
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);

  const row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer.displayName}"]`,
  );

  // Archive via context menu.
  await row.click({ button: 'right' });
  await page.locator(TID.chatRowMenuItem('archive')).click();

  // Row gone from inbox; archive link appears.
  await expect(row).toHaveCount(0);
  const archiveLink = page.locator(TID.chatListArchiveLink);
  await expect(archiveLink).toBeVisible();

  // Enter archive pane — row visible there.
  await archiveLink.click();
  await expect(row).toBeVisible();

  // Unarchive — inside the archive pane.
  await row.click({ button: 'right' });
  await page.locator(TID.chatRowMenuItem('unarchive')).click();

  // The chat is no longer archived → drops out of the archive-only
  // filter. Archive link disappears too (no more archived chats), so
  // we step back to the inbox manually and check the row is there.
  await page.locator(TID.chatListArchiveBack).click();
  await expect(archiveLink).toHaveCount(0);
  await expect(row).toBeVisible();
});
