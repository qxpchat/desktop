// Phase 1 — instant onboarding.
//
// Fresh chatmail account against nine.testrun.org. Each run mints a new
// address (the relay accumulates them; that's its job as a test relay).
//
// What we lock in:
//   - Welcome → "Sign Up" routes to the Instant form.
//   - Typing a display name enables "Create Profile".
//   - Submitting drives add_account → set_config_from_qr → configure
//     end-to-end against the real relay.
//   - On success the user lands in the chat-shell view (app-shell
//     mounted, chat-list visible, no more onboarding wrapper).

import { test, expect } from '../../fixtures/app.js';
import { TID } from '../../helpers/selectors.js';

// `configure` against the relay can take 10-30s on a cold registration.
// Pad the per-test timeout to keep the suite resilient under load.
test.setTimeout(120_000);

test('Sign Up → Create Profile lands in the chat shell', async ({ page }) => {
  // 1. Fresh accounts dir means we land on Onboarding/Welcome.
  await expect(page.locator(TID.onboarding)).toBeVisible();
  await expect(page.locator(TID.onboardingWelcome)).toBeVisible();

  // 2. Sign Up → Instant form.
  await page.locator(TID.onboardingWelcomeSignUp).click();
  await expect(page.locator(TID.onboardingInstant)).toBeVisible();

  // 3. Submit disabled until a name is entered.
  const submit = page.locator(TID.onboardingInstantSubmit);
  await expect(submit).toBeDisabled();
  await page.locator(TID.onboardingInstantName).fill(`qxp-e2e-${Date.now()}`);
  await expect(submit).toBeEnabled();

  // 4. Click → configure against nine.testrun.org. Don't assert on any
  // progress UI in between — that's brittle to ProgressOverlay refactors.
  // The only contract is "after some time, the chat shell is visible".
  await submit.click();
  await expect(page.locator(TID.appShell)).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(TID.chatList)).toBeVisible();

  // 5. The onboarding wrapper should be gone — the App.svelte branch
  // flipped from `onboarding` to `app-shell`.
  await expect(page.locator(TID.onboarding)).toHaveCount(0);
});
