// Phase 1 — scan a sign-up QR during onboarding (T014 / ONB-002.3 +
// T024 / ONB-016).
//
// Welcome → "Scan Invitation Code" → SignupScan → paste a
// `dcaccount:<host>` URL → SignupScan dispatches to the Instant form
// with the relay prefilled. From there the normal submit path runs
// `createInstantAccount(name, qr)` and registers against the *scanned*
// host instead of the default chatmail relay.
//
// We also confirm the `dclogin:` and bad-prefix guards stay user-facing.

import { test, expect } from '../../fixtures/app.js';
import { TID } from '../../helpers/selectors.js';
import { RpcClient } from '../../fixtures/daemon.js';

test.setTimeout(180_000);

test('dcaccount: scan from Welcome onboards on the scanned relay', async ({ qxp, page, context }) => {
  // Grant clipboard read so the paste-fallback can be exercised
  // headlessly (no camera in CI).
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await expect(page.locator(TID.onboardingWelcome)).toBeVisible();

  // Open the alt menu → Scan Invitation Code → scanner screen.
  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeScan).click();
  await expect(page.locator(TID.onboardingSignupScan)).toBeVisible();

  // Seed the clipboard with a dcaccount: URL pointing at the test relay
  // the rest of the suite uses, then trigger the paste button. The same
  // dispatch path runs as a real camera scan.
  await page.evaluate(() =>
    navigator.clipboard.writeText('dcaccount:nine.testrun.org'),
  );
  await page.locator(TID.onboardingSignupScanPaste).click();

  // Dispatch routes to Instant with the relay name now reflected in the
  // form's privacy line.
  await expect(page.locator(TID.onboardingInstant)).toBeVisible();
  await expect(page.locator(TID.onboardingInstant))
    .toContainText('nine.testrun.org');

  // Fill displayname and submit — `createInstantAccount` receives the
  // prefilled QR.
  await page.locator(TID.onboardingInstantName).fill(`qxp-scan-${Date.now()}`);
  await page.locator(TID.onboardingInstantSubmit).click();

  // Onboarding done = chat shell visible.
  await expect(page.locator(TID.appShell)).toBeVisible({ timeout: 90_000 });

  // Assert the resulting account's `addr` lives on the scanned relay.
  const rpc = new RpcClient(`ws://127.0.0.1:${qxp.daemonPort}/ws`);
  await rpc.connect();
  try {
    const accountId = await rpc.call<number>('get_selected_account_id');
    const addr = await rpc.call<string | null>('get_config', [accountId, 'addr']);
    expect(addr).toMatch(/@nine\.testrun\.org$/);
  } finally {
    rpc.close();
  }
});

test('dclogin: scan surfaces a guard pointing at Manual Setup', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeScan).click();
  await expect(page.locator(TID.onboardingSignupScan)).toBeVisible();

  await page.evaluate(() =>
    navigator.clipboard.writeText('dclogin://alice%40example.com?p=hunter2'),
  );
  await page.locator(TID.onboardingSignupScanPaste).click();

  // Stays on the scanner with an actionable error message.
  await expect(page.locator(TID.onboardingSignupScan)).toBeVisible();
  await expect(page.locator(TID.onboardingSignupScanError))
    .toContainText('Manual Setup');
});

test('non-signup QR surfaces a "not a sign-up code" error', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeScan).click();
  await expect(page.locator(TID.onboardingSignupScan)).toBeVisible();

  await page.evaluate(() =>
    navigator.clipboard.writeText('OPENPGP4FPR:0123456789ABCDEF'),
  );
  await page.locator(TID.onboardingSignupScanPaste).click();

  await expect(page.locator(TID.onboardingSignupScan)).toBeVisible();
  await expect(page.locator(TID.onboardingSignupScanError))
    .toContainText('not a sign-up code');
});
