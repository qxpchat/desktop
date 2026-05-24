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

test('dclogin: scan kicks the loginFromQr flow (configure fails on a fake URL)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeScan).click();
  await expect(page.locator(TID.onboardingSignupScan)).toBeVisible();

  // Fake DCLOGIN URL — well-formed enough that `set_config_from_qr`
  // parses it, but `configure` won't be able to reach example.com, so
  // the flow lands in `phase=failed`. That's the contract this asserts:
  // the dispatch *attempts* DCLOGIN onboarding (no more guard message).
  await page.evaluate(() =>
    navigator.clipboard.writeText('dclogin:alice@example.com?p=hunter2&v=1'),
  );
  await page.locator(TID.onboardingSignupScanPaste).click();

  // ProgressOverlay's failure modal appears.
  await expect(page.locator(TID.onboardingProgressError)).toBeVisible({ timeout: 30_000 });
});

test('invite QR routes to Instant with the invite banner', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeScan).click();
  await expect(page.locator(TID.onboardingSignupScan)).toBeVisible();

  // openpgp4fpr URL with invite params (`i=` invitenumber, `s=` authcode)
  // — recognised as an invite without needing dc-core's check_qr (which
  // requires an account context we don't have yet).
  await page.evaluate(() =>
    navigator.clipboard.writeText(
      'openpgp4fpr:ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234#a=alice%40example.com&i=invtoken&s=authcode&n=Alice',
    ),
  );
  await page.locator(TID.onboardingSignupScanPaste).click();

  // Dispatched to Instant with the invite banner + relabelled CTA.
  await expect(page.locator(TID.onboardingInstant)).toBeVisible();
  await expect(page.locator(TID.onboardingInviteBanner)).toBeVisible();
  await expect(page.locator(TID.onboardingInstantSubmit)).toContainText(/Sign Up & Join/);
});

test('bare openpgp4fpr fingerprint (no invite params) is rejected', async ({ page, context }) => {
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
