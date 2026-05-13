// Phase 10 — chatlist filter by chat title.
//
// Type into the chat-list search box → only chats whose name matches
// the query remain rendered. (The same input drives global message-
// search too; that case lives in message-search-global.spec.ts.)

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('chatlist filter narrows rows to the matching chat title', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  const peerRow = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer.displayName}"]`,
  );
  await expect(peerRow).toBeVisible();

  await page.locator(TID.chatListSearch).fill(peer.displayName);

  // Peer's row stays; the built-in Saved/Device chats drop out
  // (their names don't match the random pool display name).
  const visibleRows = page.locator(`${TID.chatList} [data-testid="chat-list-row"]`);
  await expect(visibleRows).toHaveCount(1);
  await expect(visibleRows.first()).toHaveAttribute('data-name', peer.displayName);

  // Clear → peer's row is visible again alongside the built-ins.
  await page.locator(TID.chatListSearch).fill('');
  await expect(peerRow).toBeVisible();
});
