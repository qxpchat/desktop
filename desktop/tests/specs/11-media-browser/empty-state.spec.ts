// Phase 11 — media browser: empty-state.
//
// A freshly-paired template chat carries only the secure-join handshake
// messages and any one-off seeds — no Image/Video/Audio/File attachments.
// All three tabs should surface the empty placeholder rather than tile
// shells or a perpetual loading state.

import { test, expect } from '../../fixtures/app-paired.js';
import { openMediaBrowser } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('media browser: empty placeholder for a chat with no media', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await openMediaBrowser(page, peer.displayName);

  for (const tab of ['gallery', 'audio', 'files'] as const) {
    await page.locator(TID.mediaBrowserTab(tab)).click();
    await expect(page.locator(TID.mediaBrowser)).toHaveAttribute('data-tab', tab);
    // The loader can flash before `get_chat_media` resolves; wait it out.
    await expect(page.locator(TID.mediaBrowserEmpty)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(TID.mediaBrowserTile)).toHaveCount(0);
    await expect(page.locator(TID.mediaBrowserRow)).toHaveCount(0);
  }
});
