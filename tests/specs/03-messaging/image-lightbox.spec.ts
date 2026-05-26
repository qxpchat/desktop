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

  // Two consecutive incoming images collapse into a single MessageGallery —
  // one `message-gallery` bubble with a `message-gallery__tile` per image.
  // They do NOT render as separate `message-bubble` / `image-cell` nodes;
  // those only exist for a lone, non-galleried image.
  const tiles = page.locator(
    `${TID.messageGallery}[data-direction="incoming"] ${TID.messageGalleryTile}`,
  );
  // Wait until both images have arrived as gallery tiles.
  await expect(tiles.nth(1)).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Open the lightbox on the first image.
  await tiles.first().click();
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

test('image lightbox: shows the send time and the message caption', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;
  const img = mediaPath('test.png');

  await openChatByName(page, peer.displayName);

  // Image carrying caption text.
  await peer.sendAttachment({
    viewtype: 'Image',
    file: img,
    filename: 'captioned.png',
    text: 'sunset over the bay',
  });

  const bubble = page
    .locator('[data-testid="message-bubble"][data-direction="incoming"][data-view-type="Image"]')
    .first();
  await expect(bubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  await page.locator(TID.imageCell).first().click();
  await expect(page.locator(TID.imageLightboxMedia)).toBeVisible();

  // Caption = the message text; timestamp is always shown.
  await expect(page.locator(TID.imageLightboxCaption)).toHaveText('sunset over the bay');
  const ts = page.locator(TID.imageLightboxTimestamp);
  await expect(ts).toBeVisible();
  await expect(ts).not.toBeEmpty();

  await page.keyboard.press('Escape');
});

test('image lightbox: exposes a download anchor with the source filename', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;
  const img = mediaPath('test.png');

  await openChatByName(page, peer.displayName);

  await peer.sendAttachment({ viewtype: 'Image', file: img, filename: 'sunset.png' });

  const bubble = page
    .locator('[data-testid="message-bubble"][data-direction="incoming"][data-view-type="Image"]')
    .first();
  await expect(bubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  await page.locator(TID.imageCell).first().click();
  await expect(page.locator(TID.imageLightboxMedia)).toBeVisible();

  // Anchor is the native <a download> — we don't actually trigger a save in
  // the test, just verify the affordance carries the right url + filename.
  const dl = page.locator(TID.imageLightboxDownload);
  await expect(dl).toBeVisible();
  await expect(dl).toHaveAttribute('download', 'sunset.png');
  const href = await dl.getAttribute('href');
  expect(href).toBeTruthy();

  await page.keyboard.press('Escape');
});
