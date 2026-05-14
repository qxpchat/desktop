// Phase 3 — image attachment.
//
// Outbound side exercises the full Attach menu wiring (composerAttach →
// attachMenuItem('file') → file-input change), not just the hidden file
// input directly. The other Phase 3 attachment specs (video / audio /
// file / gif) drive the input directly to keep their wall-clock down —
// the menu code is shared so one spec covering it is enough.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  attachAndSendFile,
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

test('image attachment round-trips end-to-end through the attach menu', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const filePath = mediaPath('test.png');

  // Peer's chat row exists in the template (from secure-join handshake),
  // so opening the chat is instant. Send AFTER opening so the full
  // ARRIVAL_TIMEOUT_MS budget applies to the IMAP-poll-for-bubble wait.
  await openChatByName(page, peer.displayName);
  await peer.sendAttachment({ viewtype: 'Image', file: filePath, filename: 'test.png' });

  const incomingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"][data-view-type="Image"]`,
  ).first();
  await expect(incomingBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Driving through the menu: click Attach → File. The menu invokes
  // `onPickFile` which calls `fileInput.click()` — but headless Chromium
  // can't open the native file dialog from a synthetic click. Workaround:
  // open the menu (so the production click handler runs and onClose
  // fires), then dispatch `setInputFiles` on the same hidden input the
  // production handler would have opened.
  await page.locator(TID.composerAttach).click();
  await expect(page.locator(TID.attachMenu)).toBeVisible();
  await page.locator(TID.attachMenuItem('file')).click();
  await attachAndSendFile(page, filePath);

  // Menu should close as a side-effect of the pick.
  await expect(page.locator(TID.attachMenu)).toHaveCount(0);

  const outgoingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-view-type="Image"]`,
  ).first();
  await expect(outgoingBubble).toBeVisible({ timeout: 10_000 });
  await expect(outgoingBubble).toHaveAttribute('data-state', 'delivered', { timeout: DELIVERED_TIMEOUT_MS });
  await waitForOutgoingRead(peer, outgoingBubble);
  await expect(outgoingBubble).toHaveAttribute('data-state', 'read');
});
