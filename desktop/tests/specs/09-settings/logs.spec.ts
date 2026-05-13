// Phase 9 — Settings: Logs.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Logs: section is reachable', async ({ page }) => {
  await openSettings(page, 'logs');
  await expect(page.locator(TID.settingsSectionBy('logs'))).toBeVisible();
});
