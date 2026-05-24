// Phase 1 — instant onboarding with an avatar step (T012 / ONB-002.1).
//
// The Instant signup form lets the user pick + crop an avatar before
// creating the profile. The picked PNG is uploaded via `uploadBlob`,
// passed into `createInstantAccount(displayName, undefined, avatarPath)`,
// and `set_config('selfavatar', path)` runs alongside the displayname
// during the onboarding flow.
//
// Asserts dc-core ends up with a `selfavatar` config after the signup
// settles, by opening an RPC client against the test daemon.

import { test, expect } from '../../fixtures/app.js';
import { TID } from '../../helpers/selectors.js';
import { mediaPath } from '../../helpers/media.js';
import { RpcClient } from '../../fixtures/daemon.js';

test.setTimeout(180_000);

test('Sign Up with an avatar persists `selfavatar` on the new account', async ({ qxp, page }) => {
  // Welcome → Sign Up → Instant form.
  await expect(page.locator(TID.onboardingWelcome)).toBeVisible();
  await page.locator(TID.onboardingWelcomeSignUp).click();
  await expect(page.locator(TID.onboardingInstant)).toBeVisible();

  // Pick the test fixture image — opens the cropper.
  await page.locator(TID.onboardingInstantAvatarInput)
    .setInputFiles(mediaPath('test.png'));
  await expect(page.locator(TID.imageCropperDialog)).toBeVisible({ timeout: 5_000 });

  // Accept the default centred crop.
  await page.locator(TID.imageCropperDialogSave).click();
  await expect(page.locator(TID.imageCropperDialog)).toHaveCount(0);

  // Name + submit.
  await page.locator(TID.onboardingInstantName).fill(`qxp-e2e-${Date.now()}`);
  await page.locator(TID.onboardingInstantSubmit).click();

  // Onboarding done = chat shell visible.
  await expect(page.locator(TID.appShell)).toBeVisible({ timeout: 90_000 });

  // Talk to the same daemon the SPA is wired to and assert `selfavatar`
  // is set on the freshly-onboarded account.
  const rpc = new RpcClient(`ws://127.0.0.1:${qxp.daemonPort}/ws`);
  await rpc.connect();
  try {
    const accountId = await rpc.call<number>('get_selected_account_id');
    const avatar = await rpc.call<string | null>('get_config', [accountId, 'selfavatar']);
    expect(avatar ?? '').not.toBe('');
  } finally {
    rpc.close();
  }
});
