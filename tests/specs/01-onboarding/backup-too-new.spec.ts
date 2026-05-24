// Phase 1 — "backup too new" guard during Add as Second Device (T020 /
// ONB-011).
//
// `lib/state/onboarding.svelte.ts → receiveBackup` runs the scanned/
// pasted code through dc-core's `check_qr`. When dc-core decodes the
// `DCBACKUP<version>:` envelope and finds the version exceeds the one
// the running binary understands (`DCBACKUP_VERSION` constant, currently
// 4), it returns `kind: 'backupTooNew'`. `receiveBackup` then throws an
// English guard string the ProgressOverlay surfaces.
//
// We craft a synthetic high-version DCBACKUP code — `DCBACKUP99:…` — and
// paste it from the clipboard. No real backup transfer happens; the
// guard short-circuits before anything network-y runs.

import { test, expect } from '../../fixtures/app.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('pasting a `DCBACKUP99:` code surfaces the too-new guard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Welcome → I Already Have a Profile → Add as Second Device.
  await expect(page.locator(TID.onboardingWelcome)).toBeVisible();
  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeAddSecondDevice).click();
  await expect(page.locator(TID.onboardingBackupReceive)).toBeVisible();

  // Synthetic DCBACKUP code with a version higher than this binary's
  // `DCBACKUP_VERSION` constant. Payload bytes don't have to be real —
  // `check_qr` short-circuits to `BackupTooNew` before consuming them.
  await page.evaluate(() =>
    navigator.clipboard.writeText('DCBACKUP99:fake-auth-token&fake-node-addr'),
  );
  await page.locator(TID.onboardingBackupReceivePasteClipboard).click();

  // Failure modal pops with the canonical guard message.
  await expect(page.locator(TID.onboardingProgressError))
    .toBeVisible({ timeout: 10_000 });
  await expect(page.locator(TID.onboardingProgressError))
    .toContainText(/newer/i);
});
