// Phase 9 — Settings: About.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('About: section is reachable and renders version info', async ({ page }) => {
  await openSettings(page, 'about');
  const section = page.locator(TID.settingsSectionBy('about'));
  await expect(section).toBeVisible();
  // Wait for `get_system_info` RPC to land — at minimum the core
  // version label moves off the "—" placeholder.
  await expect(section).toContainText(/Delta Chat core/);
});
