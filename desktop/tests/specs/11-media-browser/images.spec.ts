// Phase 11 — media browser: images tab.
//
// Peer sends a PNG. Main opens chat-info → Media → Gallery tab shows
// a tile with `data-view-type="Image"`.

import { test, expect } from '../../fixtures/app-paired.js';
import { openMediaBrowser, waitForChatRowByName } from '../../helpers/setup.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test.beforeAll(() => ensureFixtures());

test('Gallery tab shows incoming images', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await peer.sendAttachment({
    viewtype: 'Image',
    file: mediaPath('test.png'),
    filename: 'test.png',
  });
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openMediaBrowser(page, peer.displayName);

  // Default tab is gallery.
  await expect(page.locator(TID.mediaBrowser)).toHaveAttribute('data-tab', 'gallery');
  await expect(
    page.locator(TID.mediaBrowserTileByViewType('Image')).first(),
  ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
});
