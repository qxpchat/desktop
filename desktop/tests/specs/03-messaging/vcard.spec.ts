// Phase 3 — vCard (contact share).

import { test, expect } from '../../fixtures/app-paired.js';
import {
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

test('vCard share round-trips with full state glyph progression', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const filePath = mediaPath('test.vcf');

  await openChatByName(page, peer.displayName);
  await peer.sendAttachment({ viewtype: 'Vcard', file: filePath, filename: 'test.vcf' });

  const incomingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"][data-view-type="Vcard"]`,
  ).first();
  await expect(incomingBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // main → peer: share peer's own contact card via the picker.
  await page.locator(TID.composerAttach).click();
  await page.locator(TID.attachMenuItem('contact')).click();
  await expect(page.locator(TID.contactPicker)).toBeVisible();
  await page.locator(TID.contactRowByName(peer.displayName)).first().click();

  const outgoingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-view-type="Vcard"]`,
  ).first();
  await expect(outgoingBubble).toBeVisible({ timeout: 10_000 });
  await expect(outgoingBubble).toHaveAttribute('data-state', 'delivered', { timeout: DELIVERED_TIMEOUT_MS });
  await waitForOutgoingRead(peer, outgoingBubble);
  await expect(outgoingBubble).toHaveAttribute('data-state', 'read');
});
