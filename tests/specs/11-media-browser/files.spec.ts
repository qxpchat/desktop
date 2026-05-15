// Phase 11 — media browser: files tab.

import { test, expect } from '../../fixtures/app-paired.js';
import { openMediaBrowser, waitForChatRowByName } from '../../helpers/setup.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test.beforeAll(() => ensureFixtures());

test('Files tab lists incoming generic-file attachments', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await peer.sendAttachment({
    viewtype: 'File',
    file: mediaPath('test.pdf'),
    filename: 'test.pdf',
  });
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openMediaBrowser(page, peer.displayName);

  await page.locator(TID.mediaBrowserTab('files')).click();
  await expect(page.locator(TID.mediaBrowser)).toHaveAttribute('data-tab', 'files');

  await expect(
    page.locator(TID.mediaBrowserRowByViewType('File')).first(),
  ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
});
