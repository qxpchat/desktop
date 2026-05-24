// Phase 1 — provider-database before-login hint (T015 / ONB-004).
//
// ManualLogin watches the email input. When the domain matches an entry
// in dc-core's offline provider DB (`get_provider_info`), the form shows
// the `before_login_hint` text + a "More info" link to the provider's
// overview page. Status 3 = BROKEN renders red; lower statuses are a
// neutral heads-up.
//
// AOL is the simplest fixture target — DB ships it with status 2
// (Preparation) and the canonical "set up an app password" hint string.

import { test, expect } from '../../fixtures/app.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('typing an AOL address surfaces the provider hint', async ({ page }) => {
  await expect(page.locator(TID.onboardingWelcome)).toBeVisible();
  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeManualSetup).click();
  await expect(page.locator(TID.onboardingManual)).toBeVisible();

  // No hint until the field has a domain to look up.
  await expect(page.locator(TID.onboardingManualProviderHint)).toHaveCount(0);

  await page.locator(TID.onboardingManualAddr).fill('alice@aol.com');

  // Debounced 500 ms before the RPC fires.
  await expect(page.locator(TID.onboardingManualProviderHint))
    .toBeVisible({ timeout: 5_000 });
  await expect(page.locator(TID.onboardingManualProviderHint))
    .toContainText('app password');

  // Clearing the field tears the hint back down.
  await page.locator(TID.onboardingManualAddr).fill('');
  await expect(page.locator(TID.onboardingManualProviderHint))
    .toHaveCount(0, { timeout: 5_000 });
});
