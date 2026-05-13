// Phase 11 — media browser: deleting a file from the browser propagates
// to the chat view. Drives the Files tab since it has an explicit Delete
// button (gallery delete uses oncontextmenu, which is its own surface).

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openMediaBrowser,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test.beforeAll(() => ensureFixtures());

test('delete-from-MB removes the row AND the bubble in chat view', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await peer.sendAttachment({
    viewtype: 'File',
    file: mediaPath('test.pdf'),
    filename: 'mb-delete.pdf',
  });
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);

  await openMediaBrowser(page, peer.displayName);
  await page.locator(TID.mediaBrowserTab('files')).click();

  const row = page.locator(TID.mediaBrowserRowByViewType('File')).first();
  await expect(row).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  const msgId = await row.getAttribute('data-msg-id');
  expect(msgId).toBeTruthy();

  // Click Delete → confirm "Delete for Me" (incoming, so only this option
  // surfaces).
  await row.locator(TID.mediaBrowserRowDelete).click();
  await expect(page.locator(TID.deleteMsgDialog)).toBeVisible();
  await page.locator(TID.deleteMsgDialogForMe).click();

  await expect(row).toHaveCount(0, { timeout: 5_000 });

  // Back to chat → the corresponding bubble must be gone too.
  await page.locator(TID.mediaBrowserBack).click();
  await expect(
    page.locator(`[data-testid="message-bubble"][data-msg-id="${msgId}"]`),
  ).toHaveCount(0);
});
