// Phase 9 — Settings: Appearance / Theme.
//
// Theme is an app-wide pref persisted to localStorage. The visible effect
// is `document.documentElement.dataset.theme`, which the theme CSS targets
// via `:root[data-theme='dark']`. Verify both the button state AND the
// root element actually flipped — the button could be wired to no-op and
// only the segmented control would update.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

async function rootTheme(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.dataset.theme ?? null);
}

test('Appearance: theme picks propagate to documentElement.dataset.theme', async ({ page }) => {
  await openSettings(page, 'appearance');

  const dark = page.locator(TID.settingsAppearanceThemeOption('dark'));
  const light = page.locator(TID.settingsAppearanceThemeOption('light'));
  const system = page.locator(TID.settingsAppearanceThemeOption('system'));

  await dark.click();
  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => rootTheme(page)).toBe('dark');

  await light.click();
  await expect(light).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => rootTheme(page)).toBe('light');

  await system.click();
  await expect(system).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => rootTheme(page)).toBe('system');
});
