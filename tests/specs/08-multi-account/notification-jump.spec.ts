// Phase 8 — notification tap jumps to the right chat in the right profile.
//
// Bug guard: when the user is on profile B and a message arrives for
// profile A, tapping A's notification must switch to A *and* open the chat
// the notification was about. Two bugs this guards against:
//   1. The account switched but the chat never opened — flipping
//      `accounts.selectedId` fires App.svelte's account-change effect, whose
//      `selectChat(null)` wiped the chat the tap handler had just set. Fixed
//      by stashing the target via `requestChatInAccount` before the flip and
//      draining it in the (untracked) effect via `consumePendingChat`.
//   2. Navigation must be *explicit* — only a real tap navigates, never
//      plain window focus (the old focus heuristic silently switched
//      accounts on any incidental refocus).
//
// The web tap path is `Notification.onclick`. Playwright can't click an OS
// banner, so we stub `window.Notification` to capture the constructed
// instance and invoke its `onclick` — exactly what a real click fires.

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

  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  // Wait for the selection to settle on A before switching. Provisioning B
  // fires a burst of account events; if we click B while the UI optimistically
  // still thinks B is selected (stale add_account auto-select), `selectAccount`
  // early-returns without issuing `select_account(B)` and the daemon stays on
  // A — then a later refresh reverts the tile. Settling on A first guarantees
  // the click actually switches the daemon. Also confirm the daemon agrees.
  await expect(page.locator(TID.navTabsAccountById(accountA)))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });

  await page.locator(TID.navTabsAccountById(accountB)).click();
  await expect(page.locator(TID.navTabsAccountById(accountB)))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
  await expect
    .poll(async () => await mainRpc.call<number>('get_selected_account_id'), {
      timeout: 10_000,
    })
    .toBe(accountB);

  // Stub `Notification` so we can capture the banner the app fires and
  // invoke its `onclick` (a real OS banner isn't clickable from Playwright).
  // `new Notification` reads `window.Notification` at call time, so swapping
  // it now — before the message arrives — makes the IncomingMsg handler use
  // the stub. Permission reads 'granted' so the handler takes the web path.
  await page.evaluate(() => {
    class StubNotification {
      static permission = 'granted';
      static requestPermission() {
        return Promise.resolve('granted');
      }
      onclick: (() => void) | null = null;
      constructor(
        public title: string,
        public options?: unknown,
      ) {
        (window as unknown as { __lastNotif: unknown }).__lastNotif = this;
      }
      close() {}
    }
    (window as unknown as { Notification: unknown }).Notification = StubNotification;
    (window as unknown as { __lastNotif: unknown }).__lastNotif = null;
  });

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

  // Peer messages A while B is selected → IncomingMsg(contextId=A) → the
  // handler fires a notification (captured by the stub).
  await peer.sendTo('tap me to jump');

  // Wait for the banner to be constructed (nudge IMAP so the msg lands).
  const deadline = Date.now() + ARRIVAL_TIMEOUT_MS;
  let gotNotif = false;
  while (Date.now() < deadline) {
    await mainRpc.call('maybe_network');
    gotNotif = await page.evaluate(
      () => (window as unknown as { __lastNotif: unknown }).__lastNotif != null,
    );
    if (gotNotif) break;
    await page.waitForTimeout(2_000);
  }
  expect(gotNotif, 'a notification was fired for the inactive profile').toBe(true);

  // Bare window focus (even after a blur) must NOT navigate — the old
  // heuristic switched accounts here; the chosen design requires an
  // explicit tap. B stays selected.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(500);
  await expect(page.locator(TID.navTabsAccountById(accountB)))
    .toHaveAttribute('aria-pressed', 'true');

  // Now tap the banner — only this explicit click navigates.
  await page.evaluate(() =>
    (
      window as unknown as { __lastNotif: { onclick?: () => void } }
    ).__lastNotif.onclick?.(),
  );

  await expect(page.locator(TID.navTabsAccountById(accountA)))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

  // The right profile is active — now the right chat must be open. The
  // topbar carrying the peer's name is the proof the pending chat target
  // survived the account switch (the bug left the topbar blank).
  await expect(
    page.locator(TID.chatTopbarTitle).filter({ hasText: peer.displayName }),
  ).toBeVisible({ timeout: 30_000 });
});
