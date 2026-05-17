// Phase 3 — message gallery (collapsed media runs).
//
// Consecutive image/video messages from the same sender, sent within a
// minute of each other, collapse into a single gallery tile-grid. A
// captioned media message opens a new gallery; the caption shows below
// the grid. The gallery can be unrolled into individual bubbles, and any
// tile opens the standard lightbox.

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test.beforeAll(() => {
  ensureFixtures();
});

test('gallery: consecutive images collapse, unroll, and open the lightbox', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;
  const img = mediaPath('test.png');

  await openChatByName(page, peer.displayName);

  // Three caption-less images in quick succession — one gallery.
  await peer.sendAttachment({ viewtype: 'Image', file: img, filename: 'a.png' });
  await peer.sendAttachment({ viewtype: 'Image', file: img, filename: 'b.png' });
  await peer.sendAttachment({ viewtype: 'Image', file: img, filename: 'c.png' });

  // All three render as gallery tiles, not standalone bubbles.
  await expect(page.locator(TID.messageGalleryTile)).toHaveCount(3, {
    timeout: ARRIVAL_TIMEOUT_MS,
  });
  await expect(page.locator(TID.messageGallery)).toHaveCount(1);
  await expect(
    page.locator('[data-testid="message-bubble"][data-view-type="Image"]'),
  ).toHaveCount(0);

  // Any tile opens the standard lightbox.
  await page.locator(TID.messageGalleryTile).first().click();
  await expect(page.locator(TID.imageLightboxMedia)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator(TID.imageLightbox)).toHaveCount(0);

  // Unroll — the gallery is replaced by individual image bubbles.
  await page.locator(TID.messageGalleryUnroll).click();
  await expect(page.locator(TID.messageGallery)).toHaveCount(0);
  await expect(
    page.locator('[data-testid="message-bubble"][data-view-type="Image"]'),
  ).toHaveCount(3);
});

test('gallery: a captioned image opens a new gallery', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const img = mediaPath('test.png');

  await openChatByName(page, peer.displayName);

  // first batch ─┐  second batch ─┐
  //   img + cap  │    img + cap   │
  //   img        │    img         │
  await peer.sendAttachment({
    viewtype: 'Image',
    file: img,
    filename: 'a.png',
    text: 'first batch',
  });
  await peer.sendAttachment({ viewtype: 'Image', file: img, filename: 'b.png' });
  await peer.sendAttachment({
    viewtype: 'Image',
    file: img,
    filename: 'c.png',
    text: 'second batch',
  });
  await peer.sendAttachment({ viewtype: 'Image', file: img, filename: 'd.png' });

  // The captioned third image splits the run into two galleries.
  await expect(page.locator(TID.messageGallery)).toHaveCount(2, {
    timeout: ARRIVAL_TIMEOUT_MS,
  });
  const captions = page.locator(TID.messageGalleryCaption);
  await expect(captions).toHaveCount(2);
  await expect(captions.nth(0)).toHaveText('first batch');
  await expect(captions.nth(1)).toHaveText('second batch');
});
