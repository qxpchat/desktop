// Phase 1 — manual login.
//
// Uses an existing pool account's email + password. Doesn't burn relay
// resources the way `instant.spec.ts` does, so this is the spec we lean
// on most often during regression runs.
//
// What we lock in:
//   - Welcome's "I Already Have a Profile" → Manual Setup routes there.
//   - Submit is disabled until both email and password have content.
//   - Submitting valid pool creds drives configure → start_io →
//     chat-shell visible.

import { test, expect } from '../../fixtures/app.js';
import { leaseAccounts, releaseAccounts, type PoolAccount } from '../../fixtures/accounts.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(120_000);

let leased: PoolAccount[] = [];

test.beforeEach(async () => {
  leased = await leaseAccounts(1);
});

test.afterEach(() => {
  releaseAccounts(leased);
  leased = [];
});

test('Manual Setup with valid pool creds reaches the chat shell', async ({ page }) => {
  const acct = leased[0];

  // 1. Welcome → alt menu → Manual Setup.
  await expect(page.locator(TID.onboardingWelcome)).toBeVisible();
  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeManualSetup).click();
  await expect(page.locator(TID.onboardingManual)).toBeVisible();

  // 2. Submit disabled until both fields populated.
  const submit = page.locator(TID.onboardingManualSubmit);
  await expect(submit).toBeDisabled();
  await page.locator(TID.onboardingManualAddr).fill(acct.email);
  await expect(submit).toBeDisabled(); // still — password empty
  await page.locator(TID.onboardingManualPassword).fill(acct.password);
  await expect(submit).toBeEnabled();

  // 3. Submit → configure → chat shell.
  await submit.click();
  await expect(page.locator(TID.appShell)).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(TID.chatList)).toBeVisible();
  await expect(page.locator(TID.onboarding)).toHaveCount(0);
});
