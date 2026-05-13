// Phase 2 — pin / unpin.
//
// Pinned chats sort above unpinned ones regardless of last-message
// timestamp. peer1 (older) and peer2 (newer) seed two chats; natural
// order is [peer2, peer1]; pinning peer1 should flip it to [peer1, peer2]
// and unpinning should restore the original order.

import { test, expect } from '../../fixtures/app-trio.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test('pin lifts a row to the top; unpin restores order', async ({ qxpTrio, page }) => {
  const { peer1, peer2 } = qxpTrio;

  await peer1.sendTo('older');
  await expect(
    page.locator(`[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`),
  ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  await new Promise((r) => setTimeout(r, 3_000));
  await peer2.sendTo('newer');
  await expect(
    page.locator(`[data-testid="chat-list-row"][data-name="${peer2.displayName}"]`),
  ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  const rows = page.locator(`${TID.chatList} [data-testid="chat-list-row"]`);
  // Natural order — peer2 (newer) on top.
  await expect(rows.first()).toHaveAttribute('data-name', peer2.displayName);

  // Right-click peer1 → Pin.
  const peer1Row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`,
  );
  await peer1Row.click({ button: 'right' });
  await expect(page.locator(TID.chatRowMenu)).toBeVisible();
  await page.locator(TID.chatRowMenuItem('pin')).click();

  // peer1 now on top.
  await expect(rows.first()).toHaveAttribute('data-name', peer1.displayName);

  // Unpin → peer2 back on top.
  await peer1Row.click({ button: 'right' });
  await page.locator(TID.chatRowMenuItem('unpin')).click();
  await expect(rows.first()).toHaveAttribute('data-name', peer2.displayName);
});
