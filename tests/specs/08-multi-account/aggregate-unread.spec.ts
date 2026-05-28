// Phase 8 — aggregate unread on the account button (T045 / CHATLIST-020).
//
// An account tile's badge shows that account's *total* fresh count, summed
// across all its chats. inactive-profile-badge covers the single-chat case
// (count 1); this proves the badge aggregates: two different chats each get
// an unread message and the tile shows their sum (2). The account must be
// inactive for its tile badge to render, so we provision a second account,
// switch to it, then have both trio peers message the first account.

import { test, expect } from '../../fixtures/app-trio.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(180_000);

async function provisionSecondAccount(
  rpc: { call<T>(method: string, params?: unknown[]): Promise<T> },
  displayName: string,
): Promise<number> {
  const prevSelected = await rpc.call<number | null>('get_selected_account_id');
  const id = await rpc.call<number>('add_account');
  await rpc.call('set_config', [id, 'displayname', displayName]);
  await rpc.call('set_config_from_qr', [id, 'dcaccount:nine.testrun.org']);
  await rpc.call('configure', [id]);
  await rpc.call('start_io', [id]);
  if (prevSelected != null) await rpc.call('select_account', [prevSelected]);
  return id;
}

test('account tile badge sums unread across all the account\'s chats', async ({
  qxpTrio,
  page,
}) => {
  const { peer1, peer2, mainRpc } = qxpTrio;

  const accountA = (await mainRpc.call<number>('get_selected_account_id')) as number;

  // Clear leftover device/onboarding unread on A so the baseline is 0.
  const aChatIds = await mainRpc.call<number[]>('get_chatlist_entries', [accountA, null, null, null]);
  for (const id of aChatIds) await mainRpc.call('marknoticed_chat', [accountA, id]);

  const accountB = await provisionSecondAccount(mainRpc, 'Second');

  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  // Settle on A, then switch to B (so A is inactive and shows a tile badge).
  // Confirm the daemon agrees to dodge the provisioning selection race.
  await expect(page.locator(TID.navTabsAccountById(accountA)))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await page.locator(TID.navTabsAccountById(accountB)).click();
  await expect
    .poll(async () => await mainRpc.call<number>('get_selected_account_id'), {
      timeout: 10_000,
    })
    .toBe(accountB);

  // Both transports CONNECTED before sending (avoid the lost-NOTIFY race).
  await expect.poll(
    async () => await mainRpc.call<number>('get_connectivity', [accountA]),
    { timeout: 60_000 },
  ).toBeGreaterThanOrEqual(4000);
  for (const p of [peer1, peer2]) {
    await expect.poll(
      async () => await p.rpc.call<number>('get_connectivity', [p.accountId]),
      { timeout: 60_000 },
    ).toBeGreaterThanOrEqual(4000);
  }

  // One message into each of A's two chats → A's total unread = 2.
  await peer1.sendTo('from one');
  await peer2.sendTo('from two');

  const badge = page.locator(TID.navTabsAccountBadgeById(accountA));
  const deadline = Date.now() + ARRIVAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await badge.textContent())?.trim() === '2') break;
    await mainRpc.call('maybe_network');
    await page.waitForTimeout(2_000);
  }
  await expect(badge).toHaveText('2');
});
