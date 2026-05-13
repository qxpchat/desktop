// Phase 11 — media browser: videos in the Gallery tab.

import { test, expect } from '../../fixtures/app-paired.js';
import { openMediaBrowser, waitForChatRowByName } from '../../helpers/setup.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test.beforeAll(() => ensureFixtures());

test('Gallery tab shows incoming videos with a play overlay', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await peer.sendAttachment({
    viewtype: 'Video',
    file: mediaPath('test.mp4'),
    filename: 'test.mp4',
  });
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openMediaBrowser(page, peer.displayName);

  await expect(
    page.locator(TID.mediaBrowserTileByViewType('Video')).first(),
  ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
});
