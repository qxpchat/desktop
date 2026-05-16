// Phase 3 — image lightbox gallery navigation.
//
// Opening an inline image pulls the chat's whole image gallery; the
// lightbox's ← / → arrows (keyboard + on-screen buttons) step through
// every adjacent photo. We seed two images so a gallery exists, then
// verify the visible item changes and round-trips back.

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test.beforeAll(() => {
  ensureFixtures();
});

test('image lightbox: arrows step through the chat gallery', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const img = mediaPath('test.png');

  await openChatByName(page, peer.displayName);

  // Two images so the lightbox has a gallery to navigate.
  await peer.sendAttachment({ viewtype: 'Image', file: img, filename: 'one.png' });
  await peer.sendAttachment({ viewtype: 'Image', file: img, filename: 'two.png' });

  const imageBubbles = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"][data-view-type="Image"]`,
  );
  // Wait until at least two image bubbles have arrived.
  await expect(imageBubbles.nth(1)).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Open the lightbox on the first image.
  await page.locator(TID.imageCell).first().click();
  const media = page.locator(TID.imageLightboxMedia);
  await expect(media).toBeVisible();

  // Gallery nav controls appear only with >1 item.
  await expect(page.locator(TID.imageLightboxNext)).toBeVisible();
  await expect(page.locator(TID.imageLightboxPrev)).toBeVisible();

  const first = (await media.getAttribute('data-msg-id')) ?? '';
  expect(first).not.toBe('');

  // → (keyboard) advances to the next photo.
  await page.keyboard.press('ArrowRight');
  await expect(media).not.toHaveAttribute('data-msg-id', first);

  // ← (on-screen button) returns to the first.
  await page.locator(TID.imageLightboxPrev).click();
  await expect(media).toHaveAttribute('data-msg-id', first);

  // Escape closes the lightbox.
  await page.keyboard.press('Escape');
  await expect(page.locator(TID.imageLightbox)).toHaveCount(0);
});
