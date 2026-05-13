// Phase 11 — media browser: audio tab.

import { test, expect } from '../../fixtures/app-paired.js';
import { openMediaBrowser, waitForChatRowByName } from '../../helpers/setup.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test.beforeAll(() => ensureFixtures());

test('Audio tab lists incoming audio messages', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await peer.sendAttachment({
    viewtype: 'Audio',
    file: mediaPath('test.mp3'),
    filename: 'test.mp3',
  });
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openMediaBrowser(page, peer.displayName);

  await page.locator(TID.mediaBrowserTab('audio')).click();
  await expect(page.locator(TID.mediaBrowser)).toHaveAttribute('data-tab', 'audio');

  await expect(
    page.locator(TID.mediaBrowserRowByViewType('Audio')).first(),
  ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
});
