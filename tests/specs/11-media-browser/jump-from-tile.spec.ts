// Phase 11 — media browser: jump from tile back to the chat.
//
// Peer sends an image, main opens MediaBrowser, clicks the tile →
// MediaBrowser closes, ChatView mounts with the peer's chat selected,
// the bubble for that image is visible.

import { test, expect } from '../../fixtures/app-paired.js';
import { openMediaBrowser, waitForChatRowByName } from '../../helpers/setup.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test.beforeAll(() => ensureFixtures());

test('clicking a gallery tile jumps to the chat with the bubble visible', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await peer.sendAttachment({
    viewtype: 'Image',
    file: mediaPath('test.png'),
    filename: 'test.png',
  });
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openMediaBrowser(page, peer.displayName);

  const tile = page.locator(TID.mediaBrowserTileByViewType('Image')).first();
  await expect(tile).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  const msgId = await tile.getAttribute('data-msg-id');
  expect(msgId).toBeTruthy();

  await tile.click();

  // ChatView is back. The bubble for that exact msg-id is visible.
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(peer.displayName);
  await expect(
    page.locator(`[data-testid="message-bubble"][data-msg-id="${msgId}"]`),
  ).toBeVisible({ timeout: 10_000 });
});
