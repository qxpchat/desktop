// Phase 9 — add proxy via QR scan (T029 / CONNECT-005.2).
//
// Settings → Connectivity → Proxy → Add Proxy now has a "Scan QR"
// toggle. Activating it swaps the text-input pane for the shared
// `lib/QrScanArea.svelte` primitive; a scanned (or pasted) `proxy:`
// URL flows back through the same `submitAdd` validator that powers
// the manual entry — `check_qr` confirms `kind: 'proxy'`, then
// `set_config_from_qr` installs it. The test exercises the paste
// fallback (no camera in headless Chromium) against a syntactically
// valid SOCKS URL.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Settings → Proxy → Scan QR adds the scanned proxy', async ({ qxpPaired, page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Open Settings → Connectivity → Proxy.
  await page.locator(TID.chatListBurger).click();
  await page.locator(TID.navTabsSettings).click();
  await page.locator(TID.settingsRailItem('connectivity')).click();
  await expect(page.locator(TID.settingsSectionBy('connectivity'))).toBeVisible();

  // Settings/Connectivity exposes a "Proxy" entry that pushes into the
  // Proxy view inline.
  await page.getByRole('button', { name: /Proxy/ }).first().click();

  // Add → Scan tab.
  await page.getByRole('button', { name: /Add Proxy/ }).click();
  await expect(page.locator(TID.settingsProxyAddDialog)).toBeVisible();
  await page.locator(TID.settingsProxyAddScan).click();
  await expect(page.locator(TID.settingsProxyScanPaste)).toBeVisible();

  // Seed clipboard with a SOCKS5 proxy URL — dc-core's `check_qr`
  // recognises raw `socks5://`/`http(s)://`/`ss://` URLs as
  // `kind: 'proxy'` (there's no separate `proxy:` URI scheme; the
  // header in the share-proxy QR is just bare URL). Same code path as
  // a real camera scan.
  await page.evaluate(() =>
    navigator.clipboard.writeText('socks5://1.2.3.4:1080'),
  );
  await page.locator(TID.settingsProxyScanPaste).click();

  // Dialog closes once `submitAdd` succeeds; a row tagged with the new
  // proxy's host appears in the saved-proxies list.
  await expect(page.locator(TID.settingsProxyAddDialog))
    .toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator(TID.settingsProxyRowByHost('1.2.3.4')))
    .toBeVisible({ timeout: 10_000 });
});
