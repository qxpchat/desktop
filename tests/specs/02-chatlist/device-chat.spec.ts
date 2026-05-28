// Phase 2 — device / system chat distinct styling (T042 / CHATLIST-013).
//
// dc-core's "Device Messages" chat (`is_device_talk`) carries app/system
// notices, not peer conversation. `ChatListRow.svelte` marks it distinctly:
// a `data-chat-kind="device"` attribute and an info glyph beside the name,
// so it reads as a non-peer system chat. The paired template ships with the
// onboarding device chat, so it's present without setup.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

type Entry = { kind: string; id: number; isDeviceTalk?: boolean };

test('device chat row is marked distinctly', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;

  // Resolve the device-chat id from the daemon (its name is core-localized).
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
  const deviceId = Object.values(entries).find(
    (e) => e.kind === 'ChatListItem' && e.isDeviceTalk,
  )?.id;
  expect(deviceId, 'device chat present in chatlist').toBeTruthy();

  const row = page.locator(
    `[data-testid="chat-list-row"][data-chat-id="${deviceId}"]`,
  );
  await expect(row).toBeVisible({ timeout: 10_000 });
  // Marked as a device chat, with the info glyph; a regular peer chat is not.
  await expect(row).toHaveAttribute('data-chat-kind', 'device');
  await expect(row.locator(TID.chatListRowDevice)).toBeVisible();

  const peerRow = page.locator(
    `[data-testid="chat-list-row"][data-name="${qxpPaired.peer.displayName}"]`,
  );
  await expect(peerRow).toHaveAttribute('data-chat-kind', 'regular');
  await expect(peerRow.locator(TID.chatListRowDevice)).toHaveCount(0);
});
