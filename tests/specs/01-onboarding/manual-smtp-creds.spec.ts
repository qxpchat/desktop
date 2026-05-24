// Phase 1 — distinct SMTP login + password in Manual Setup (T016 /
// ONB-005.2).
//
// dc-core supports separate `send_user` / `send_pw` config keys for
// outgoing-mail auth, useful for self-hosted setups where the IMAP and
// SMTP accounts differ. ManualLogin's Advanced section now exposes both
// fields; this test asserts they exist, accept input, and don't break
// the basic "Email + Password" path (which most users follow with the
// SMTP fields blank — dc-core then reuses addr + mail_pw).
//
// Doesn't drive a real `configure` round-trip: that would require an
// SMTP server willing to authenticate the bogus creds we'd type, which
// no test fixture provides. UI presence + state-binding is the
// contract this task ships.

import { test, expect } from '../../fixtures/app.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Advanced section exposes SMTP login + password distinct from email creds', async ({ page }) => {
  await expect(page.locator(TID.onboardingWelcome)).toBeVisible();
  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeManualSetup).click();
  await expect(page.locator(TID.onboardingManual)).toBeVisible();

  // Expand Advanced; SMTP user + password fields live in the SMTP
  // fieldset below the server/port/security rows.
  await page.locator(TID.onboardingManualAdvancedToggle).click();
  await expect(page.locator(TID.onboardingManualSmtpUser)).toBeVisible();
  await expect(page.locator(TID.onboardingManualSmtpPassword)).toBeVisible();

  // Fill main email + password.
  await page.locator(TID.onboardingManualAddr).fill('alice@imap.example.com');
  await page.locator(TID.onboardingManualPassword).fill('imap-secret');

  // Fill *different* SMTP creds. Sanity-check that the input bindings
  // hold the typed values — the submit pipeline (`loginManually`) reads
  // these state cells when assembling the advanced config dict.
  await page.locator(TID.onboardingManualSmtpUser).fill('alice@smtp.example.com');
  await page.locator(TID.onboardingManualSmtpPassword).fill('smtp-secret');
  await expect(page.locator(TID.onboardingManualSmtpUser)).toHaveValue('alice@smtp.example.com');
  await expect(page.locator(TID.onboardingManualSmtpPassword)).toHaveValue('smtp-secret');

  // Verify the SMTP creds aren't shadowing the main ones — they're
  // genuinely distinct.
  expect(
    await page.locator(TID.onboardingManualAddr).inputValue(),
  ).not.toBe(await page.locator(TID.onboardingManualSmtpUser).inputValue());
  expect(
    await page.locator(TID.onboardingManualPassword).inputValue(),
  ).not.toBe(await page.locator(TID.onboardingManualSmtpPassword).inputValue());
});
