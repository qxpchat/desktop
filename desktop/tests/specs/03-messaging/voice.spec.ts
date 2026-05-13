// Phase 3 — voice message.
//
// Peer→main: send a Voice viewtype via daemon RPC, assert incoming
// bubble. Main→peer voice via UI recorder is deferred (MediaRecorder
// in headless Chromium is brittle); we test state-glyph progression
// via a plain text reply in this spec's context.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  sendComposerText,
  waitForChatRowByName,
  waitForOutgoingRead,
} from '../../helpers/setup.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { ARRIVAL_TIMEOUT_MS, DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test.beforeAll(() => {
  ensureFixtures();
});

test('voice message arrives as a Voice bubble; outgoing text walks state glyph', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await peer.sendAttachment({
    viewtype: 'Voice',
    file: mediaPath('test.mp3'),
    filename: 'voice.mp3',
  });
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  const incomingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"][data-view-type="Voice"]`,
  ).first();
  await expect(incomingBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  await sendComposerText(page, 'got the voice, thanks');

  const outgoingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"]`,
    { hasText: 'got the voice, thanks' },
  );
  await expect(outgoingBubble).toBeVisible({ timeout: 10_000 });
  await expect(outgoingBubble).toHaveAttribute('data-state', 'delivered', { timeout: DELIVERED_TIMEOUT_MS });
  await waitForOutgoingRead(peer, outgoingBubble);
  await expect(outgoingBubble).toHaveAttribute('data-state', 'read');
});
