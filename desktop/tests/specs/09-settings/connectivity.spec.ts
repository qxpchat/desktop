// Phase 9 — Settings: Connectivity.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Connectivity: section is reachable', async ({ page }) => {
  await openSettings(page, 'connectivity');
  await expect(page.locator(TID.settingsSectionBy('connectivity'))).toBeVisible();
});
