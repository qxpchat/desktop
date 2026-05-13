// Phase 3 — one-shot location share.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  waitForChatRowByName,
  waitForOutgoingRead,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS, DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(180_000);

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4040' });
  await context.setGeolocation({ latitude: 52.52, longitude: 13.405 });
});

test('location share round-trips with full state glyph progression', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await peer.sendAttachment({
    viewtype: 'Text',
    text: 'around there',
    location: [48.8566, 2.3522],
  });
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  const incomingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"][data-has-location="true"]`,
  ).first();
  await expect(incomingBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Pre-fill composer so the outgoing location message carries a text
  // body (defensive against empty-body WantsMdn edge cases).
  await page.locator(TID.composerTextarea).fill('here we are');
  await page.locator(TID.composerAttach).click();
  await page.locator(TID.attachMenuItem('location')).click();
  await expect(page.locator(TID.locationPicker)).toBeVisible();
  const sendBtn = page.locator(TID.locationPickerSend);
  await expect(sendBtn).toBeEnabled({ timeout: 10_000 });
  await sendBtn.click();

  const outgoingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-has-location="true"]`,
  ).first();
  await expect(outgoingBubble).toBeVisible({ timeout: 10_000 });
  await expect(outgoingBubble).toHaveAttribute('data-state', 'delivered', { timeout: DELIVERED_TIMEOUT_MS });
  await waitForOutgoingRead(peer, outgoingBubble, 150_000);
  await expect(outgoingBubble).toHaveAttribute('data-state', 'read');
});
