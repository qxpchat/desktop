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

test('search clear button wipes the query and re-shows every chat', async ({ qxpTrio, page }) => {
  const { peer1, peer2 } = qxpTrio;

  await peer1.sendTo('hi');
  await peer2.sendTo('hi');
  await expect(
    page.locator(`[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`),
  ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  const search = page.locator(TID.chatListSearch);
  // SearchField forwards data-testid to the inner <input>; the clear button
  // is a sibling, so locate it page-rooted (only one search field is open
  // in this view).
  const clear = page.locator(TID.searchFieldClear);
  const rows = page.locator(`${TID.chatList} [data-testid="chat-list-row"]`);

  // Empty query → clear button absent.
  await expect(clear).toHaveCount(0);

  await search.fill(peer1.displayName);
  await expect(rows).toHaveCount(1);
  // Non-empty query → clear button appears.
  await expect(clear).toBeVisible();

  await clear.click();
  await expect(search).toHaveValue('');
  await expect(clear).toHaveCount(0);
  // Both chats back in the list.
  await expect(
    page.locator(`[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`),
  ).toBeVisible();
  await expect(
    page.locator(`[data-testid="chat-list-row"][data-name="${peer2.displayName}"]`),
  ).toBeVisible();
});
