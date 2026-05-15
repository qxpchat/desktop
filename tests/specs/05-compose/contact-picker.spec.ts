// Phase 5 — contact picker filters by display name.
//
// The plan calls for a "fresh email address creates a contact" test,
// but qxp's current ComposePane has no email-input affordance — typing
// in the search box filters the existing contacts list and that's it.
// New contacts come in via the QR-scan flow (`compose-pane__new-contact`)
// which can't be exercised in headless Chromium without a fake camera.
//
// What we *can* lock in: typing into the search filters the displayed
// contacts to those matching the query, and clears back to the full
// set when the search is empty. That's the production-relevant
// behavior of the picker; the email-add edge case stays a TODO until
// the UI grows that affordance.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('compose-pane search filters the contact list to the matching peer', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await page.locator(TID.composeButton).click();
  await expect(page.locator(TID.composePane)).toBeVisible();

  const peerRow = page.locator(TID.contactRowByName(peer.displayName));
  await expect(peerRow).toBeVisible();

  // Typing peer's name keeps just that row visible.
  await page.locator(TID.composePaneSearch).fill(peer.displayName);
  await expect(peerRow).toBeVisible();
  // Use a globally unique made-up substring to verify the negative case.
  const bogus = `__nope__${Date.now()}`;
  await page.locator(TID.composePaneSearch).fill(bogus);
  await expect(peerRow).toHaveCount(0);

  // Clear the query → row returns.
  await page.locator(TID.composePaneSearch).fill('');
  await expect(peerRow).toBeVisible();
});
