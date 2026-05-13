// Phase 9 — Settings: Chats & Media.
//
// Open the section and assert it mounts. The pane shows configuration
// toggles whose surfaces are deferred until we have specific behaviors
// to assert (auto-download, read receipts, etc.).

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Chats & Media: section is reachable', async ({ page }) => {
  await openSettings(page, 'chats');
  await expect(page.locator(TID.settingsSectionBy('chats'))).toBeVisible();
});
