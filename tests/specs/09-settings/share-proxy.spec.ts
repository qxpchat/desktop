// Phase 9 — share an installed proxy as QR + link (T031 / CONNECT-005.4).
//
// `settings/ShareProxy.svelte` renders the saved proxy URL via dc-core's
// `create_qr_svg` (no frontend QR encoder), plus a copy-link button.
// qxp is *ahead* of the reference here — reference only ships the link
// (DT=⚠️). Test confirms the share modal exposes both the SVG and the
// raw URL.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Settings → Proxy → Share renders both a QR and the raw URL', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;
  const accountId = await mainRpc.call<number>('get_selected_account_id') as number;

  // Pre-install a proxy via RPC so the row exists before we click Share.
  // This sidesteps the Add-dialog → check_qr round-trip — that flow is
  // already covered by `proxy-scan-add.spec.ts`.
  await mainRpc.call('set_config_from_qr', [accountId, 'socks5://1.2.3.4:1080']);

  // Open Settings → Connectivity → Proxy.
  await page.locator(TID.chatListBurger).click();
  await page.locator(TID.navTabsSettings).click();
  await page.locator(TID.settingsRailItem('connectivity')).click();
  await page.getByRole('button', { name: /Proxy/ }).first().click();

  // The row's Share button opens the ShareProxy modal.
  await expect(page.locator(TID.settingsProxyRowByHost('1.2.3.4'))).toBeVisible();
  await page.locator(TID.settingsProxyShare).first().click();

  // Modal shows QR (SVG) + raw URL + Copy Link.
  await expect(page.locator(TID.shareProxy)).toBeVisible({ timeout: 5_000 });
  // The QR SVG mounts asynchronously (one RPC round-trip to `create_qr_svg`).
  await expect(page.locator(`${TID.shareProxyQr} svg`)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(TID.shareProxyUrl))
    .toContainText('socks5://1.2.3.4:1080');
  await expect(page.locator(TID.shareProxyCopy)).toBeVisible();
});
