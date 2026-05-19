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
  // The badge renders the unread count, not just a dot — one message
  // sent above must yield exactly "1".
  await expect(row.locator(TID.chatListRowUnread)).toHaveText('1');

  // Open the chat. ChatView fires markNoticed on mount, but the chatlist's
  // freshMessageCounter only reaches 0 once the daemon's ChatlistItemChanged
  // event has round-tripped. The row badge is no signal for that — selection
  // suppresses the badge regardless of the counter — so poll the context
  // menu, whose entry is "Mark as Read" while the counter is non-zero and
  // flips to "Mark as Unread" once markNoticed has propagated. The open menu
  // snapshots the chat, so each poll iteration must re-open it for a fresh
  // read; close any stale menu first or the right-click hits the backdrop.
  await row.click();
  await expect(async () => {
    const backdrop = page.getByRole('button', { name: 'Close popover' });
    if (await backdrop.isVisible()) await backdrop.click();
    await row.click({ button: 'right' });
    await expect(
      page.locator(TID.chatRowMenuItem('mark-unread')),
    ).toBeVisible({ timeout: 500 });
  }).toPass();

  // Re-mark unread — the menu is already open from the final poll iteration.
  await page.locator(TID.chatRowMenuItem('mark-unread')).click();
  await expect(row.locator(TID.chatListRowUnread)).toBeVisible();

  // And now the menu offers Mark as Read instead.
  await row.click({ button: 'right' });
  await expect(page.locator(TID.chatRowMenuItem('mark-read'))).toBeVisible();
  await page.locator(TID.chatRowMenuItem('mark-read')).click();
  await expect(row.locator(TID.chatListRowUnread)).toHaveCount(0);
});
