// Phase 9 — `proxy:` QR routed through QrDispatcher offers a confirm
// dialog (T030 / CONNECT-005.3).
//
// `qr/QrDispatcher.svelte` runs scanned/pasted text through dc-core's
// `check_qr`. When `check_qr` returns `kind: 'proxy'`, the dispatcher
// surfaces a confirmation card with the proxy host:port and an Apply
// button — that's what this test asserts. The actual `set_config_from_qr`
// round-trip is covered by `proxy-scan-add.spec.ts`; here we just lock
// in the dispatch + confirmation surface so changes to QrDispatcher's
// `kind === 'proxy'` branch don't silently regress.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('pasting a proxy URL into QrDispatcher shows the Add proxy card', async ({ page }) => {
  // Enter the general scanner via Compose → New Contact (the
  // newContact purpose lands on the same QrDispatcher screen used by
  // every QR-driven flow).
  await page.locator(TID.composeButton).click();
  await page.locator(TID.composePaneNewContact).click();
  await expect(page.locator(TID.qrDispatcher)).toBeVisible();

  // Paste a syntactically valid SOCKS5 URL — dc-core's check_qr
  // recognises bare `socks5://`/`http(s)://`/`ss://` URLs as `proxy`.
  await page.locator(TID.qrDispatcherPasteInput).fill('socks5://1.2.3.4:1080');
  await page.locator(TID.qrDispatcherPasteSubmit).click();

  // Confirmation card surfaces with the expected kind + body + Apply
  // action label.
  await expect(page.locator(TID.qrDispatcherCard))
    .toHaveAttribute('data-qr-kind', 'proxy', { timeout: 10_000 });
  await expect(page.locator(TID.qrDispatcherTitle)).toContainText(/Add proxy/);
  await expect(page.locator(TID.qrDispatcherBody)).toContainText('1.2.3.4:1080');
  await expect(page.locator(TID.qrDispatcherConfirm)).toContainText(/Apply/);
});
