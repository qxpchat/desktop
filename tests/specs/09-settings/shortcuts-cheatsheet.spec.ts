// Phase 9 — keyboard-shortcut cheat sheet in Settings → About (T044).
//
// The `SHORTCUTS` table (lib/shortcuts.ts) is the single source for both the
// dispatcher and this display, so the listed bindings can't drift from the
// ones that fire. Also exercises the open-settings shortcut itself.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Settings → About lists keyboard shortcuts; open-settings shortcut works', async ({
  qxpPaired,
  page,
}) => {
  // The open-settings shortcut (Ctrl/Cmd+,) opens Settings without the mouse.
  await page.keyboard.press('Control+,');
  await expect(page.locator(TID.settings)).toBeVisible({ timeout: 10_000 });

  await page.locator(TID.settingsRailItem('about')).click();

  const table = page.locator(TID.settingsAboutShortcuts);
  await expect(table).toBeVisible();
  // A representative binding is listed with its keys.
  const nextRow = table.locator('tr[data-shortcut="next-chat"]');
  await expect(nextRow).toContainText('Next chat');
  await expect(nextRow).toContainText('Alt ↓');
});
