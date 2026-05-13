// Phase 8 — add a second account via the UI.
//
// Expand the profile rail (it starts collapsed) → click the +
// tile → run Instant onboarding for a fresh chatmail account → rail
// now shows two avatars. Verifies the end-to-end add-account flow
// users actually take.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(120_000);

test('add a second account via the + tile + instant onboarding', async ({ page }) => {
  // Expand the profile rail.
  await page.locator(TID.chatListBurger).click();

  // One account configured so far (from the template).
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(1);

  // Click + → onboarding-welcome appears (re-entering the onboarding
  // flow scoped to a *new* account, not the initial-setup path).
  await page.locator(TID.navTabsAddAccount).click();
  await expect(page.locator(TID.onboardingWelcome)).toBeVisible();

  // Sign Up → Instant form.
  await page.locator(TID.onboardingWelcomeSignUp).click();
  await expect(page.locator(TID.onboardingInstant)).toBeVisible();

  await page.locator(TID.onboardingInstantName).fill('Second');
  await page.locator(TID.onboardingInstantSubmit).click();

  // configure round-trip (10-30s on a cold relay).
  await page.waitForSelector(TID.appShell, { timeout: 60_000 });

  // We already toggled `pane1Collapsed=false` at the top of the test —
  // the pref is sticky across the onboarding round-trip, so the rail
  // is open by the time we land back on the chat shell. Don't toggle
  // again or it'll collapse.
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });
});
