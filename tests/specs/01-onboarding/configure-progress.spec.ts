// Phase 1 — configure-progress UI (T021 / ONB-012).
//
// `lib/state/onboarding.svelte.ts → ConfigureProgress` event handler
// pumps `onboarding.phase.progress` 0 → 1000 while dc-core works through
// transport bootstrap; `ProgressOverlay.svelte` reflects that as a
// `<progress>` bar inside a Modal. On success the phase flips back to
// `idle`, the modal closes, and the chat shell appears. On failure the
// modal stays open with an error message + OK button.
//
// Two tests: one each for the success + failure transitions. Together
// they cover the `data-phase` attribute the overlay carries on its
// content div (configuring → failed | idle), which is the contract this
// task's DoD asks for.

import { test, expect } from '../../fixtures/app.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(120_000);

test('Instant onboarding shows configuring progress, then dismisses on success', async ({ page }) => {
  await page.locator(TID.onboardingWelcomeSignUp).click();
  await expect(page.locator(TID.onboardingInstant)).toBeVisible();
  await page.locator(TID.onboardingInstantName).fill(`qxp-progress-${Date.now()}`);
  await page.locator(TID.onboardingInstantSubmit).click();

  // Progress modal appears with the configuring phase tag.
  await expect(page.locator(TID.onboardingProgress)).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(`${TID.onboardingProgress} [data-phase]`))
    .toHaveAttribute('data-phase', 'configuring');

  // On success it closes itself + the chat shell appears. Generous
  // timeout because cold relay registrations take 10-30s on the test
  // chatmail server.
  await expect(page.locator(TID.appShell)).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(TID.onboardingProgress)).toHaveCount(0);
});

test('Manual Setup with an unreachable host flips the overlay to failed', async ({ page }) => {
  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeManualSetup).click();
  await expect(page.locator(TID.onboardingManual)).toBeVisible();

  // `.invalid` is RFC 6761 — a TLD the OS resolver must refuse. Bad
  // creds against it give dc-core's `configure` a fast, deterministic
  // failure to surface in the overlay.
  await page.locator(TID.onboardingManualAddr).fill('alice@nonexistent-host-xyz.invalid');
  await page.locator(TID.onboardingManualPassword).fill('does-not-matter');
  await page.locator(TID.onboardingManualSubmit).click();

  await expect(page.locator(TID.onboardingProgressError))
    .toBeVisible({ timeout: 60_000 });
});
