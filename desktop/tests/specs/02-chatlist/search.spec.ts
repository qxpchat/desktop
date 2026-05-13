// Phase 2 — chat list search.
//
// Two peers seed two chats. Typing one peer's display name into the
// search box should leave exactly that row in the list.

import { test, expect } from '../../fixtures/app-trio.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test('search filters the chat list by display name', async ({ qxpTrio, page }) => {
  const { peer1, peer2 } = qxpTrio;

  await peer1.sendTo('hi');
  await peer2.sendTo('hi');
  await expect(
    page.locator(`[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`),
  ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  await expect(
    page.locator(`[data-testid="chat-list-row"][data-name="${peer2.displayName}"]`),
  ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  const search = page.locator(TID.chatListSearch);
  const peer1Row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`,
  );
  const peer2Row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer2.displayName}"]`,
  );
  const rows = page.locator(`${TID.chatList} [data-testid="chat-list-row"]`);

  await search.fill(peer1.displayName);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-name', peer1.displayName);

  await search.fill('');
  await expect(peer1Row).toBeVisible();
  await expect(peer2Row).toBeVisible();
});
