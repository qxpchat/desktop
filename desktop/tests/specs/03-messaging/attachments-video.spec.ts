// Phase 3 — video attachment.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  waitForChatRowByName,
  waitForOutgoingRead,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { ARRIVAL_TIMEOUT_MS, DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test.beforeAll(() => {
  ensureFixtures();
});

test('video attachment round-trips with full state glyph progression', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const filePath = mediaPath('test.mp4');

  await peer.sendAttachment({ viewtype: 'Video', file: filePath, filename: 'test.mp4' });
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  const incomingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"][data-view-type="Video"]`,
  ).first();
  await expect(incomingBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  await page.locator(TID.composerFileInput).setInputFiles(filePath);

  const outgoingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-view-type="Video"]`,
  ).first();
  await expect(outgoingBubble).toBeVisible({ timeout: 10_000 });
  await expect(outgoingBubble).toHaveAttribute('data-state', 'delivered', { timeout: DELIVERED_TIMEOUT_MS });
  await waitForOutgoingRead(peer, outgoingBubble);
  await expect(outgoingBubble).toHaveAttribute('data-state', 'read');
});
