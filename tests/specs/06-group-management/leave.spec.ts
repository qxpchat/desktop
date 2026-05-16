// Phase 6 — leave a group via ChatInfo.
//
// Click Leave → ConfirmDialog → core sends the leave message + drops
// self from the group. We verify three things, not just the UI nav:
//   1. The topbar with the group's title is gone (selectChat(null) ran).
//   2. The daemon-side state confirms `selfInGroup=false` on that chat
//      — that's the real "left" predicate, independent of routing.
//   3. The chat row still exists in the chatlist (leaving a group is
//      not deleting it — past-conversations stay accessible).

import { test, expect } from '../../fixtures/app-paired.js';
import { createGroupAndOpenInfo } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('leave: drops selfInGroup, keeps the chat row in the list', async ({ qxpPaired, page }) => {
  const { peer, mainRpc } = qxpPaired;

  const groupName = `Bye ${Date.now()}`;
  await createGroupAndOpenInfo(page, peer.displayName, groupName);

  // Resolve the chat id while we still know it exists in the active view.
  const accountId = (await mainRpc.call<number[]>('get_all_account_ids'))[0];
  const entries = await mainRpc.call<number[]>('get_chatlist_entries', [accountId, null, groupName, null]);
  expect(entries.length).toBeGreaterThan(0);
  const groupChatId = entries[0];

  // Before leaving: self is a member of the group.
  const before = await mainRpc.call<{ selfInGroup: boolean }>('get_full_chat_by_id', [accountId, groupChatId]);
  expect(before.selfInGroup).toBe(true);

  await page.locator(TID.chatInfoLeave).click();
  await page.locator(TID.confirmDialogConfirm).click();

  // 1. Topbar with the group name is gone.
  await expect(
    page.locator(TID.chatTopbarTitle).filter({ hasText: groupName }),
  ).toHaveCount(0);

  // 2. Daemon-side: selfInGroup flipped to false. `leave_group` is
  //    synchronous on the local side (the SMTP send is async), so the
  //    flag is reliable to read here.
  const after = await mainRpc.call<{ selfInGroup: boolean }>('get_full_chat_by_id', [accountId, groupChatId]);
  expect(after.selfInGroup).toBe(false);

  // 3. The chat row stays — leaving ≠ deleting.
  await expect(
    page.locator(`[data-testid="chat-list-row"][data-name="${groupName}"]`),
  ).toBeVisible({ timeout: 5_000 });
});
