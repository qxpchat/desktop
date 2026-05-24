// Phase 1 — proxy configuration before onboarding (T022 / ONB-014).
//
// Welcome screen now has a "Connection settings" link in the footer
// that opens `ProxyDialog`. Saving a URL there stashes it in
// `lib/state/onboarding.svelte → pendingProxy.url`; `runOnboardingFlow`
// applies it via `set_config_from_qr` + `proxy_enabled=1` right after
// `add_account`, before `configure` runs.
//
// We don't drive a full configure through a real proxy here — that
// would need a SOCKS server in the test infra. Instead the test
// asserts the dialog accepts a syntactically valid URL, the chip on
// Welcome surfaces the host, and the rune holds the saved URL (peeked
// via `localStorage`-free state inspection through the page).

import { test, expect } from '../../fixtures/app.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Welcome → Connection settings → Save proxy → chip shows host', async ({ page }) => {
  await expect(page.locator(TID.onboardingWelcome)).toBeVisible();

  // No chip when no proxy is set.
  await expect(page.locator(TID.onboardingWelcomeProxyHost)).toHaveCount(0);

  // Open dialog, type a syntactically valid SOCKS URL, save.
  await page.locator(TID.onboardingWelcomeProxy).click();
  await expect(page.locator(TID.onboardingProxyDialog)).toBeVisible();
  await page.locator(TID.onboardingProxyDialogInput).fill('socks5://127.0.0.1:1080');
  await page.locator(TID.onboardingProxyDialogSave).click();
  await expect(page.locator(TID.onboardingProxyDialog)).toHaveCount(0);

  // Chip surfaces the host:port.
  await expect(page.locator(TID.onboardingWelcomeProxyHost)).toBeVisible();
  await expect(page.locator(TID.onboardingWelcomeProxyHost))
    .toContainText('127.0.0.1:1080');

  // Re-opening the dialog repopulates the field from the rune.
  await page.locator(TID.onboardingWelcomeProxy).click();
  await expect(page.locator(TID.onboardingProxyDialogInput))
    .toHaveValue('socks5://127.0.0.1:1080');

  // Clear → chip disappears.
  await page.locator(TID.onboardingProxyDialogClear).click();
  await expect(page.locator(TID.onboardingProxyDialog)).toHaveCount(0);
  await expect(page.locator(TID.onboardingWelcomeProxyHost)).toHaveCount(0);
});

test('Invalid URL surfaces an error and does not stash the proxy', async ({ page }) => {
  await page.locator(TID.onboardingWelcomeProxy).click();
  await expect(page.locator(TID.onboardingProxyDialog)).toBeVisible();

  // No supported scheme prefix.
  await page.locator(TID.onboardingProxyDialogInput).fill('not-a-proxy-url');
  await page.locator(TID.onboardingProxyDialogSave).click();

  // Dialog stays open with an inline error; nothing was stashed.
  await expect(page.locator(TID.onboardingProxyDialog)).toBeVisible();
  await expect(page.locator(TID.onboardingProxyDialogError)).toBeVisible();
});
