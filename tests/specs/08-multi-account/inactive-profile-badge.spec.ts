// Phase 8 — inactive-profile fresh-msg badge.
//
// Bug guard: when the user is viewing profile B and profile A receives a
// message, A's tile in the nav rail must light a badge as soon as the
// IncomingMsg event lands — without the user having to switch accounts
// first. Earlier behaviour: the badge only appeared after the next full
// `recomputeAllFreshCounts` (i.e. a B→A→B account switch), because
// `profiles.list[idx] = …` didn't re-trigger the `{#each}` rebind in
// NavTabs reliably for the inactive tile.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(180_000);

async function provisionSecondAccount(
  rpc: { call<T>(method: string, params?: unknown[]): Promise<T> },
  displayName: string,
): Promise<number> {
  // dc-core's `add_account` auto-selects the new account, which would
  // silently switch main away from the templated account A. Capture and
  // restore the prior selection so the test starts from a known state.
  const prevSelected = await rpc.call<number | null>('get_selected_account_id');
  const id = await rpc.call<number>('add_account');
  await rpc.call('set_config', [id, 'displayname', displayName]);
  await rpc.call('set_config_from_qr', [id, 'dcaccount:nine.testrun.org']);
  await rpc.call('configure', [id]);
  // Start IO *only* on the new account. `start_io_for_all_accounts`
  // would restart A's already-stable IDLE and create the cold-IDLE
  // race the badge assertion is sensitive to.
  await rpc.call('start_io', [id]);
  if (prevSelected != null) await rpc.call('select_account', [prevSelected]);
  return id;
}

/** Mark every chat on `accountId` as noticed — drops freshCount to 0
 *  across both real chats and the device-info chat (which `get_fresh_msgs`
 *  silently skips, so `markseen_msgs` alone is not enough). The paired
 *  templates ship with two unread onboarding entries in the device chat,
 *  which would otherwise inflate the badge count this test asserts on. */
async function clearFreshOn(
  rpc: { call<T>(method: string, params?: unknown[]): Promise<T> },
  accountId: number,
): Promise<void> {
  const chatIds = await rpc.call<number[]>('get_chatlist_entries', [accountId, null, null, null]);
  for (const id of chatIds) await rpc.call('marknoticed_chat', [accountId, id]);
}

test('badge appears on inactive profile A when a message arrives for A while B is selected', async ({ qxpPaired, page }) => {
  const { peer, mainRpc } = qxpPaired;

  const firstId = await mainRpc.call<number>('get_selected_account_id') as number;
  const secondId = await provisionSecondAccount(mainRpc, 'Second');

  // Clear leftover unread messages on A (template ships with unread device
  // onboarding messages). Without this, freshCount baseline is non-zero and
  // the post-send delta is unobservable.
  await clearFreshOn(mainRpc, firstId);

  // Open the profile rail so the nav tiles are visible, then switch to B.
  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  // Wait for selection to settle on A before switching. Provisioning B fires
  // a burst of account events; if we click B while the UI optimistically
  // still shows B selected (stale add_account auto-select), `selectAccount`
  // early-returns without issuing `select_account(B)`, the daemon stays on A,
  // and a later refresh reverts the tile back to A mid-test.
  await expect(page.locator(TID.navTabsAccountById(firstId)))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });

  await page.locator(TID.navTabsAccountById(secondId)).click();
  // Confirm the click actually switched — both the UI tile and the daemon's
  // selected account (the latter catches the early-return race above).
  await expect(page.locator(TID.navTabsAccountById(secondId)))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
  await expect
    .poll(async () => await mainRpc.call<number>('get_selected_account_id'), {
      timeout: 10_000,
    })
    .toBe(secondId);

  // B is now the selected tile — its own badge would never render. A is
  // inactive; its badge starts hidden because A has no fresh messages yet.
  await expect(page.locator(TID.navTabsAccountBadgeById(firstId))).toHaveCount(0);

  // Wait for *both* main IMAP IDLE and peer SMTP to be CONNECTED
  // (4000) before peer sends. dc-core's connectivity enum:
  //   1000 NOT_CONNECTED · 2000 CONNECTING · 3000 WORKING · 4000 CONNECTED
  // See `mark-all-read.spec.ts` for the full rationale — short
  // version: WORKING (3000) means dc-core is still mid-fetch and
  // hasn't entered IDLE yet, so `NOTIFY` for the new mail is lost;
  // peer SMTP not being open queues the send entirely.
  await expect.poll(
    async () => await mainRpc.call<number>('get_connectivity', [firstId]),
    { timeout: 60_000 },
  ).toBeGreaterThanOrEqual(4000);
  await expect.poll(
    async () => await peer.rpc.call<number>('get_connectivity', [peer.accountId]),
    { timeout: 60_000 },
  ).toBeGreaterThanOrEqual(4000);

  // Peer sends to A while B is selected. The IncomingMsg event must drive
  // A's freshCount → badge, without any account switch on main.
  const msgId = await peer.sendTo('ping while A is inactive');

  // Wait for peer's outbox to flush — `misc_send_text_message` returns
  // synchronously, but SMTP submission is async. ≥26 (OutDelivered)
  // means the relay accepted the mail, which is the precondition for
  // A's IMAP IDLE NOTIFY to fire.
  await expect.poll(
    async () => {
      const m = await peer.rpc.call<{ state: number }>('get_message', [peer.accountId, msgId]);
      return m.state;
    },
    { timeout: 60_000 },
  ).toBeGreaterThanOrEqual(26);

  // Then poll the main side; defensively nudge IMAP each iteration.
  const deadline = Date.now() + ARRIVAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const count = await page.locator(TID.navTabsAccountBadgeById(firstId)).count();
    if (count > 0) break;
    await mainRpc.call('maybe_network');
    await page.waitForTimeout(2_000);
  }
  // Sanity-check assert — the poll loop above already saw the badge,
  // so this collapses to Playwright's default 5 s timeout for a clean
  // failure message if the relay handshake exhausted the polled budget.
  await expect(page.locator(TID.navTabsAccountBadgeById(firstId)))
    .toBeVisible();
  await expect(page.locator(TID.navTabsAccountBadgeById(firstId)))
    .toHaveText('1');
});
