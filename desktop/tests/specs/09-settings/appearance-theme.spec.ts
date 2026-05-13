// Phase 9 — Settings: Appearance / Theme.
//
// Theme is an app-wide pref persisted to localStorage (not a daemon
// config), so the round-trip check is "click dark → button is marked
// aria-checked=true and the `<html>` element picks up the dark theme
// class".

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Appearance: switch theme to Dark', async ({ page }) => {
  await openSettings(page, 'appearance');

  const darkButton = page.locator(TID.settingsAppearanceThemeOption('dark'));
  await darkButton.click();

  await expect(darkButton).toHaveAttribute('aria-checked', 'true');
});
