// Phase 3 — multi-file attachment.
//
// Picking more than one file stacks every file as its own preview row in
// the composer. The user can drop individual rows with the row's X. On
// send, deltachat's one-file-per-message model fans the stack out into N
// messages (the caption rides the first only). This spec picks three
// files, removes one, and asserts the remaining two land as bubbles.

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test.beforeAll(() => {
  ensureFixtures();
});

test('multi-file pick stacks previews and sends one message per file', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;

  await openChatByName(page, peer.displayName);

  // Pick three files — png stages as Image, pdf/mp3 each as their own row.
  await page
    .locator(TID.composerFileInput)
    .setInputFiles([mediaPath('test.png'), mediaPath('test.pdf'), mediaPath('test.mp3')]);

  const rows = page.locator(TID.composerAttachmentBar);
  await expect(rows).toHaveCount(3);

  // Drop the middle row (the pdf) via its X — leaves png + mp3.
  await rows.nth(1).locator(TID.composerAttachmentBarClose).click();
  await expect(rows).toHaveCount(2);

  await page.locator(TID.composerSend).click();
  await expect(rows).toHaveCount(0);

  const imageBubble = page
    .locator('[data-testid="message-bubble"][data-direction="outgoing"][data-view-type="Image"]')
    .first();
  const audioBubble = page
    .locator('[data-testid="message-bubble"][data-direction="outgoing"][data-view-type="Audio"]')
    .first();

  await expect(imageBubble).toBeVisible({ timeout: 10_000 });
  await expect(audioBubble).toBeVisible({ timeout: 10_000 });
  await expect(imageBubble).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });
  await expect(audioBubble).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });
});
