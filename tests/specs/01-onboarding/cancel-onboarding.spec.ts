// Phase 1 — cancel onboarding cleans up immediately (T023 / ONB-015).
//
// `cancelOnboarding` in `lib/state/onboarding.svelte.ts` calls
// `stop_ongoing_process(pendingAccountId)`. dc-core's `configure` then
// errors out, the `runOnboardingFlow` catch path calls `remove_account`,
// and the daemon returns to a state with no accounts at all (assuming
// the user wasn't reusing the form — first signup attempt). This
// asserts the round-trip closes the loop instead of leaving the
// half-configured account around until `purgeUnconfigured` mops up on
// next boot.

import { test, expect } from '../../fixtures/app.js';
import { TID } from '../../helpers/selectors.js';
import { RpcClient } from '../../fixtures/daemon.js';

test.setTimeout(60_000);

test('cancelling Instant onboarding removes the pending account immediately', async ({ qxp, page }) => {
  // Fresh daemon — no accounts yet.
  const rpc = new RpcClient(`ws://127.0.0.1:${qxp.daemonPort}/ws`);
  await rpc.connect();
  try {
    expect((await rpc.call<number[]>('get_all_account_ids')).length).toBe(0);

    // Start an instant signup.
    await page.locator(TID.onboardingWelcomeSignUp).click();
    await page.locator(TID.onboardingInstantName).fill(`qxp-cancel-${Date.now()}`);
    await page.locator(TID.onboardingInstantSubmit).click();

    // Wait until the daemon has provisioned the pending account
    // (`runOnboardingFlow → add_account` lands before `configure`).
    await expect.poll(
      async () => (await rpc.call<number[]>('get_all_account_ids')).length,
      { timeout: 30_000 },
    ).toBeGreaterThan(0);

    // Cancel from the progress overlay.
    await page.locator(TID.onboardingProgressCancel).click();

    // Within a couple of seconds the pending account is gone — no
    // restart needed. The failure-modal closes on its own once the
    // catch path reaches `phase: failed` and the user dismisses it (we
    // skip dismissing it here — the assertion only cares about daemon
    // state).
    await expect.poll(
      async () => (await rpc.call<number[]>('get_all_account_ids')).length,
      { timeout: 15_000 },
    ).toBe(0);
  } finally {
    rpc.close();
  }
});
