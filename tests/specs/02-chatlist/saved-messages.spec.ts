// Phase 2 — "Saved Messages" self-chat (T041 / CHATLIST-012).
//
// dc-core ships a self-chat (`is_self_talk`) used as a personal notes /
// bookmark space. It appears in the chatlist like any other chat; the chat
// view labels it "Saved messages" (MainPane) and keeps a working composer
// (you can always message yourself). This asserts it's present and openable.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

type Entry = { kind: string; id: number; isSelfTalk?: boolean };

test('Saved Messages self-chat is present and openable', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;

  // Resolve the self-chat id from the daemon (its localized name is
  // core-provided, so we address the row by id rather than text).
  const accountId = (await mainRpc.call<number>('get_selected_account_id')) as number;
  const ids = await mainRpc.call<number[]>('get_chatlist_entries', [
    accountId,
    null,
    null,
    null,
  ]);
  const entries = await mainRpc.call<Record<number, Entry>>(
    'get_chatlist_items_by_entries',
    [accountId, ids],
  );
  const selfId = Object.values(entries).find(
    (e) => e.kind === 'ChatListItem' && e.isSelfTalk,
  )?.id;
  expect(selfId, 'self-chat present in chatlist').toBeTruthy();

  const row = page.locator(
    `[data-testid="chat-list-row"][data-chat-id="${selfId}"]`,
  );
  await expect(row).toBeVisible({ timeout: 10_000 });

  // Open it — chat view shows the "Saved messages" title and a usable
  // composer (you can always message yourself).
  await row.click();
  await expect(
    page.locator(TID.chatTopbarTitle).filter({ hasText: 'Saved messages' }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(TID.composer)).toBeVisible();
});
