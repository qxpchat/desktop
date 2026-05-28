// Phase 8 — notification tap jumps to the right chat in the right profile.
//
// Bug guard: when the user is on profile B and a message arrives for
// profile A, tapping A's notification must switch to A *and* open the chat
// the notification was about. Earlier behaviour: the account switched but
// the chat never opened — setting `accounts.selectedId` fires App.svelte's
// account-change effect, whose `selectChat(null)` raced (and wiped) the
// `selectChat(target.chatId)` the notification drain set right after.
//
// The fix stashes the chat target via `requestChatInAccount` *before*
// flipping the account; the effect drains it via `consumePendingChat`
// instead of clearing. This test drives the same path the OS banner tap
// does: a notification fires (pushing a pending jump), then a `window`
// focus event drains it (`drainPendingOnFocus`).

import { test, expect } from '../../fixtures/app-paired.js';
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

test('tapping a notification for an inactive profile opens its chat in that profile', async ({
  qxpPaired,
  page,
}) => {
  const { peer, mainRpc } = qxpPaired;

  const accountA = (await mainRpc.call<number>('get_selected_account_id')) as number;
  const accountB = await provisionSecondAccount(mainRpc, 'Second');

  // Switch the UI to profile B; profile A (with the paired peer) is now
  // inactive — exactly the state where the bug bit.
  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });
  await page.locator(TID.navTabsAccountById(accountB)).click();
  await expect(page.locator(TID.navTabsAccountById(accountB)))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });

  // Both transports CONNECTED before peer sends (same rationale as
  // inactive-profile-badge: WORKING means mid-fetch, NOTIFY is lost).
  await expect.poll(
    async () => await mainRpc.call<number>('get_connectivity', [accountA]),
    { timeout: 60_000 },
  ).toBeGreaterThanOrEqual(4000);
  await expect.poll(
    async () => await peer.rpc.call<number>('get_connectivity', [peer.accountId]),
    { timeout: 60_000 },
  ).toBeGreaterThanOrEqual(4000);

  // Peer messages A while B is selected → IncomingMsg(contextId=A) →
  // notification handler pushes a pending jump for A's chat.
  await peer.sendTo('tap me to jump');

  // Drive the focus-drain the way an OS banner tap would. Nudge IMAP and
  // dispatch a `window` focus each iteration: once the IncomingMsg has
  // landed (pending pushed), the next focus drains it and switches to A.
  const deadline = Date.now() + ARRIVAL_TIMEOUT_MS;
  let switched = false;
  while (Date.now() < deadline) {
    await mainRpc.call('maybe_network');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const pressed = await page
      .locator(TID.navTabsAccountById(accountA))
      .getAttribute('aria-pressed');
    if (pressed === 'true') {
      switched = true;
      break;
    }
    await page.waitForTimeout(2_000);
  }
  expect(switched, 'notification jump switched to profile A').toBe(true);

  // The right profile is active — now the right chat must be open. The
  // topbar carrying the peer's name is the proof the pending chat target
  // survived the account switch (the bug left the topbar blank).
  await expect(
    page.locator(TID.chatTopbarTitle).filter({ hasText: peer.displayName }),
  ).toBeVisible({ timeout: 10_000 });
});
