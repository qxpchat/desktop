// Phase 3 — generic file attachment.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  waitForOutgoingRead,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { ARRIVAL_TIMEOUT_MS, DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test.beforeAll(() => {
  ensureFixtures();
});

test('file attachment round-trips with full state glyph progression', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const filePath = mediaPath('test.pdf');

  await openChatByName(page, peer.displayName);
  await peer.sendAttachment({ viewtype: 'File', file: filePath, filename: 'test.pdf' });

  const incomingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"][data-view-type="File"]`,
  ).first();
  await expect(incomingBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  await page.locator(TID.composerFileInput).setInputFiles(filePath);

  const outgoingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-view-type="File"]`,
  ).first();
  await expect(outgoingBubble).toBeVisible({ timeout: 10_000 });
  await expect(outgoingBubble).toHaveAttribute('data-state', 'delivered', { timeout: DELIVERED_TIMEOUT_MS });
  await waitForOutgoingRead(peer, outgoingBubble);
  await expect(outgoingBubble).toHaveAttribute('data-state', 'read');
});
