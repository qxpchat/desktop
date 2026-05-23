// Phase 8 — private-tag edit + hover tooltip (T004 / ACCT-002.5 + T008 /
// ACCT-007).
//
// Tag is edited in Settings → Profile (alongside display name + signature
// + avatar), not from the rail right-click menu — qxp keeps profile-data
// mutations on a single screen. Save round-trips through dc-core's
// `private_tag` config key and `refreshProfiles`. The hover tooltip on
// the NavTabs tile reads `profile.privateTag` and renders it as one of
// its lines, alongside display name, addr and connectivity.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(120_000);

test('set a private tag in Settings → Profile → tooltip surfaces it on hover', async ({ qxpPaired, page }) => {
  // Open the profile rail so the tile is visible later.
  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(1, { timeout: 10_000 });

  // Click the footer "Settings" button → land on default section → switch
  // to Profile via the rail item.
  await page.locator(TID.navTabsSettings).click();
  await page.locator(TID.settingsRailItem('profile')).click();
  await expect(page.locator(TID.settingsSectionBy('profile'))).toBeVisible();

  // Fill the tag and save.
  await page.locator(TID.settingsProfileTag).fill('Work');
  await page.locator(TID.settingsProfileSave).click();

  // Wait briefly for the save round-trip (button label flips to "Saved").
  await expect(page.locator(TID.settingsProfileSave)).toHaveText(/Saved/, { timeout: 10_000 });

  // Back to the chat shell, hover the profile tile, assert tooltip
  // surfaces the tag plus an email address.
  await page.locator(TID.settingsBack).click();
  await page.mouse.move(0, 0);

  await page.locator(TID.navTabsAccount).first().hover();
  await expect(page.locator(TID.navTabsHoverCard)).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(TID.navTabsHoverCard)).toContainText('Work');

  const cardText = await page.locator(TID.navTabsHoverCard).innerText();
  expect(cardText).toMatch(/.+@.+/);

  // Move away → tooltip clears.
  await page.mouse.move(0, 0);
  await expect(page.locator(TID.navTabsHoverCard)).toHaveCount(0);
});
