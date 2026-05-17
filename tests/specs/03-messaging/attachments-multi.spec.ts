// Phase 3 — multi-file attachment.
//
// Picking more than one file in the composer's file input skips the
// caption step: deltachat is one-file-per-message, so the batch is
// confirmed and then fanned out into N separate messages. This spec
// drives the hidden input directly with two files of different types
// and asserts both land as outgoing bubbles.

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test.beforeAll(() => {
  ensureFixtures();
});

test('multi-file pick confirms then sends one message per file', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await openChatByName(page, peer.displayName);

  // Two files of different types — png stages as Image, pdf as File.
  await page
    .locator(TID.composerFileInput)
    .setInputFiles([mediaPath('test.png'), mediaPath('test.pdf')]);

  // No attachment-preview row for a multi-pick — straight to the confirm.
  await expect(page.locator(TID.composerAttachmentBar)).toHaveCount(0);
  await expect(page.locator(TID.multiSendConfirm)).toBeVisible();
  await page.locator(TID.confirmDialogConfirm).click();
  await expect(page.locator(TID.multiSendConfirm)).toHaveCount(0);

  const imageBubble = page
    .locator('[data-testid="message-bubble"][data-direction="outgoing"][data-view-type="Image"]')
    .first();
  const fileBubble = page
    .locator('[data-testid="message-bubble"][data-direction="outgoing"][data-view-type="File"]')
    .first();

  await expect(imageBubble).toBeVisible({ timeout: 10_000 });
  await expect(fileBubble).toBeVisible({ timeout: 10_000 });
  await expect(imageBubble).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });
  await expect(fileBubble).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });
});
