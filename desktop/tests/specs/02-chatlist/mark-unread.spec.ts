// Phase 2 — mark as unread.
//
// When the user opens a chat, ChatView's `markNoticed` fires and the
// unread badge clears. Right-click → Mark as Unread should put the
// badge back and the menu entry should flip from "mark-read" to
// "mark-unread" depending on the current state.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(60_000);

test('mark-as-unread restores the unread badge after a chat was read', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  const row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer.displayName}"]`,
  );
  // The chat row exists from the template's secure-join handshake.
  // Send AFTER the row is confirmed present — then wait for the unread
  // badge as the message-arrival signal.
  await expect(row).toBeVisible();
  await peer.sendTo(`are you there? ${Date.now()}`);
  await expect(row.locator(TID.chatListRowUnread)).toBeVisible({
    timeout: ARRIVAL_TIMEOUT_MS,
  });

  // Open the chat → markNoticed → badge clears.
  await row.click();
  await expect(row.locator(TID.chatListRowUnread)).toHaveCount(0);

  // Re-mark unread via context menu.
  await row.click({ button: 'right' });
  await page.locator(TID.chatRowMenuItem('mark-unread')).click();
  await expect(row.locator(TID.chatListRowUnread)).toBeVisible();

  // And now the menu offers Mark as Read instead.
  await row.click({ button: 'right' });
  await expect(page.locator(TID.chatRowMenuItem('mark-read'))).toBeVisible();
  await page.locator(TID.chatRowMenuItem('mark-read')).click();
  await expect(row.locator(TID.chatListRowUnread)).toHaveCount(0);
});
