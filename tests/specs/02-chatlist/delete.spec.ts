// Phase 2 — delete chat.
//
// Right-click → Delete → confirmation dialog → Delete for Me. For a 1:1
// the dialog uses the "Delete for Me" copy (no leave_group step). After
// confirm the row disappears.
//
// The cancel path is also covered: open the dialog, hit Cancel, and the
// row must still be present.

import { test, expect } from '../../fixtures/app-paired.js';
import { waitForChatRowByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(60_000);

test('delete chat removes the row after confirmation; cancel keeps it', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await peer.sendTo('will be deleted');
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);

  const row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer.displayName}"]`,
  );

  // Cancel path first — row stays.
  await row.click({ button: 'right' });
  await page.locator(TID.chatRowMenuItem('delete')).click();
  await expect(page.locator(TID.deleteChatDialog)).toBeVisible();
  await page.locator(TID.deleteChatDialogCancel).click();
  await expect(page.locator(TID.deleteChatDialog)).toHaveCount(0);
  await expect(row).toBeVisible();

  // Confirm path — row gone.
  await row.click({ button: 'right' });
  await page.locator(TID.chatRowMenuItem('delete')).click();
  await page.locator(TID.deleteChatDialogConfirm).click();
  await expect(page.locator(TID.deleteChatDialog)).toHaveCount(0);
  // Row vanishes only once delete_chat → ChatlistChanged → reload
  // propagates; under suite load that round-trip can exceed the 5s
  // default, so give it room.
  await expect(row).toHaveCount(0, { timeout: 15_000 });
});
