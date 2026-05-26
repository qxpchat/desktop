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
  waitForOutgoingRead,
} from '../../helpers/setup.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { ARRIVAL_TIMEOUT_MS, DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(300_000);

test.beforeAll(() => {
  ensureFixtures();
});

test('voice bubble keeps the speed toggle inside its right edge on a narrow chat pane', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;
  // Narrow viewport — without the bubble's voice-specific `min-width`
  // override the speed pill renders past the bubble's right edge here.
  await page.setViewportSize({ width: 700, height: 720 });
  await openChatByName(page, peer.displayName);
  await peer.sendAttachment({
    viewtype: 'Voice',
    file: mediaPath('test.mp3'),
    filename: 'voice.mp3',
  });
  const bubble = page
    .locator('[data-testid="message-bubble"][data-view-type="Voice"]')
    .first();
  await bubble.waitFor({ timeout: ARRIVAL_TIMEOUT_MS });
  const bb = await bubble.boundingBox();
  const pill = await bubble.locator('.speed').boundingBox();
  expect(bb).not.toBeNull();
  expect(pill).not.toBeNull();
  // The pill's right edge must sit inside the bubble's right edge.
  expect((pill!.x + pill!.width) <= (bb!.x + bb!.width)).toBe(true);
});

test('voice message arrives as a Voice bubble; outgoing text walks state glyph', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await openChatByName(page, peer.displayName);
  await peer.sendAttachment({
    viewtype: 'Voice',
    file: mediaPath('test.mp3'),
    filename: 'voice.mp3',
  });

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
