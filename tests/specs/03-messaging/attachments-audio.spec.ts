// Phase 3 — audio attachment.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  attachAndSendFile,
  openChatByName,
  waitForOutgoingRead,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { ARRIVAL_TIMEOUT_MS, DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(300_000);

test.beforeAll(() => {
  ensureFixtures();
});

test('audio attachment round-trips with full state glyph progression', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const filePath = mediaPath('test.mp3');

  await openChatByName(page, peer.displayName);
  await peer.sendAttachment({ viewtype: 'Audio', file: filePath, filename: 'test.mp3' });

  const incomingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"][data-view-type="Audio"]`,
  ).first();
  await expect(incomingBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  await attachAndSendFile(page, filePath);

  const outgoingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-view-type="Audio"]`,
  ).first();
  await expect(outgoingBubble).toBeVisible({ timeout: 10_000 });
  await expect(outgoingBubble).toHaveAttribute('data-state', 'delivered', { timeout: DELIVERED_TIMEOUT_MS });
  await waitForOutgoingRead(peer, outgoingBubble);
  await expect(outgoingBubble).toHaveAttribute('data-state', 'read');
});
