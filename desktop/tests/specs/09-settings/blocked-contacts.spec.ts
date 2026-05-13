// Phase 9 — Settings: Blocked contacts.
//
// Section is reachable. Round-tripping a block via the UI requires a
// contact-info → Block flow that's covered by Phase 11 (cross-cutting);
// here we just lock in the surface.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Blocked: section is reachable', async ({ page }) => {
  await openSettings(page, 'blocked');
  await expect(page.locator(TID.settingsSectionBy('blocked'))).toBeVisible();
});
