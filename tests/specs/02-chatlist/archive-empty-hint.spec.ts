// Phase 2 — empty-archive hint (T033 / CHATLIST-002.1).
//
// `ChatListPane.svelte` now branches its empty-state copy:
//   - filtered (search) → "No conversations match."
//   - archive view, empty → "No archived conversations. Long-press
//     or right-click a chat in the inbox to archive it."
//   - inbox, empty → "No conversations yet."
//
// Test opens the archive view (which is always empty on a fresh paired
// fixture) by setting `paneMode` directly through the burger / archive
// link, and asserts the archive-specific copy.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('empty archive view shows an archive-specific hint, not the generic inbox one', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;
  const accountId = await mainRpc.call<number>('get_selected_account_id') as number;

  // Paired template ships with one chat with peer. Archive it via RPC
  // so the inbox loses it and the "Archived chats" entry surfaces in
  // the chatlist for us to click. `JsonrpcChatVisibility` is a plain
  // serde enum since deltachat-jsonrpc 2.50 — the variant goes on the
  // wire as a bare string ("Normal" / "Archived" / "Pinned"), not the
  // legacy integer code.
  const entries = await mainRpc.call<number[]>('get_chatlist_entries', [accountId, null, null, null]);
  expect(entries.length).toBeGreaterThan(0);
  for (const chatId of entries) {
    await mainRpc.call('set_chat_visibility', [accountId, chatId, 'Archived']);
  }

  // Open the archive folder via the in-list link.
  await expect(page.locator(TID.chatListArchiveLink)).toBeVisible({ timeout: 10_000 });
  await page.locator(TID.chatListArchiveLink).click();

  // Now unarchive everything so the archive is empty.
  for (const chatId of entries) {
    await mainRpc.call('set_chat_visibility', [accountId, chatId, 'Normal']);
  }

  // The archive-specific copy should surface. Generic inbox copy
  // ("No conversations yet.") should not.
  await expect(page.locator(TID.chatListEmpty))
    .toContainText(/No archived conversations/, { timeout: 10_000 });
  await expect(page.locator(TID.chatListEmpty))
    .not.toContainText(/No conversations yet/);
});
