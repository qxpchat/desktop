// Phase 9 — connectivity report (T026 / CONNECT-002).
//
// qxp ships a structured equivalent of dc-core's HTML connectivity
// report: `settings/Connectivity.svelte` consumes the daemon's
// `get_connectivity_report` RPC and renders one `.relay` row per
// configured transport, complete with the per-relay address, quota
// hints, and a default-relay toggle. This test confirms the round-trip:
// opening Settings → Connectivity for the templated account surfaces at
// least one transport row tagged with the account's `addr`.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Settings → Connectivity renders per-relay rows for the active account', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;
  const accountId = await mainRpc.call<number>('get_selected_account_id') as number;
  const addr = await mainRpc.call<string | null>('get_config', [accountId, 'addr']);
  expect(addr).toBeTruthy();

  // Open Settings → Connectivity via the footer cog → rail item.
  await page.locator(TID.chatListBurger).click();
  await page.locator(TID.navTabsSettings).click();
  await page.locator(TID.settingsRailItem('connectivity')).click();
  await expect(page.locator(TID.settingsSectionBy('connectivity'))).toBeVisible();

  // At least one relay row appears, tagged with the templated addr.
  const relay = page.locator(TID.settingsConnectivityRelay).first();
  await expect(relay).toBeVisible({ timeout: 10_000 });
  await expect(relay).toHaveAttribute('data-addr', addr ?? '');
});
