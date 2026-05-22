// Phase 8 — account-level mute (T002 / ACCT-002.2 + T009 / ACCT-008).
//
// qxp has no dc-core surface for account-mute (only per-chat
// `set_chat_mute_duration`), so the toggle is a frontend pref in
// `prefs.svelte.ts → mutedAccounts`. NavTabs overlays a mute glyph on the
// tile when set; `notifications.ts` early-returns on `IncomingMsg` for
// muted accounts. This test exercises the UI toggle (right-click → Mute /
// Unmute) and asserts the glyph appears + clears.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

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
  if (prevSelected != null) await rpc.call('select_account', [prevSelected]);
  return id;
}

test('mute / unmute account toggles tile glyph', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;

  const firstId = await mainRpc.call<number>('get_selected_account_id') as number;
  const secondId = await provisionSecondAccount(mainRpc, 'Second');

  // Open the profile rail so the nav tiles are visible.
  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  // Switch to the second account so right-clicking A doesn't also activate
  // it (the menu still opens either way, but keeping focus on B mirrors a
  // realistic user muting a background profile).
  await page.locator(TID.navTabsAccountById(secondId)).click();

  // No glyph initially.
  await expect(page.locator(TID.navTabsAccountMuteById(firstId))).toHaveCount(0);

  // Right-click A → Mute.
  await page.locator(TID.navTabsAccountById(firstId)).click({ button: 'right' });
  await expect(page.locator(TID.navTabsAccountMenu)).toBeVisible();
  await page.locator(TID.navTabsAccountMenuMute).click();

  // Glyph appears.
  await expect(page.locator(TID.navTabsAccountMuteById(firstId))).toBeVisible();

  // Right-click again → menu now shows Unmute (Mute is gone).
  await page.locator(TID.navTabsAccountById(firstId)).click({ button: 'right' });
  await expect(page.locator(TID.navTabsAccountMenuUnmute)).toBeVisible();
  await expect(page.locator(TID.navTabsAccountMenuMute)).toHaveCount(0);
  await page.locator(TID.navTabsAccountMenuUnmute).click();

  // Glyph clears.
  await expect(page.locator(TID.navTabsAccountMuteById(firstId))).toHaveCount(0);
});
