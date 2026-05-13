// Phase 9 — Settings: Appearance / Accent.
//
// Accent is a per-profile override — pick a swatch, the picked button
// gets the active state.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Appearance: pick an accent swatch', async ({ page }) => {
  await openSettings(page, 'appearance');

  // Pick a non-default swatch — count + click first one not already active.
  const swatches = page.locator(TID.settingsAppearanceAccentSwatch);
  const total = await swatches.count();
  expect(total).toBeGreaterThan(1);

  // Pick the 5th — guaranteed to not be the system default.
  const target = swatches.nth(5);
  const color = await target.getAttribute('data-color');
  expect(color).toBeTruthy();
  await target.click();

  await expect(target).toHaveClass(/active/);
});
