// Phase 9 — Settings: About.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('About: renders core version + sqlite + arch from get_system_info', async ({ page }) => {
  await openSettings(page, 'about');
  await expect(page.locator(TID.settingsSectionBy('about'))).toBeVisible();

  // `get_system_info` is async; until it resolves the three rows render
  // the em-dash placeholder. Pinning to "non-placeholder + non-empty"
  // avoids coupling to the exact upstream version string.
  for (const tid of [
    TID.settingsAboutCoreVersion,
    TID.settingsAboutSqliteVersion,
    TID.settingsAboutArch,
  ]) {
    const cell = page.locator(tid);
    await expect(cell).toBeVisible();
    await expect(cell).not.toHaveText('—', { timeout: 10_000 });
    await expect(cell).not.toHaveText('');
  }
});
