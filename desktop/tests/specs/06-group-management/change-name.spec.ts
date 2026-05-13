// Phase 6 — rename a group via ChatInfo.

import { test, expect } from '../../fixtures/app-paired.js';
import { createGroupAndOpenInfo } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('rename: edit group name and persist via Save', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const initial = `Project ${Date.now()}`;
  const renamed = `${initial} (renamed)`;

  await createGroupAndOpenInfo(page, peer.displayName, initial);

  await expect(page.locator(TID.chatInfoName)).toHaveText(initial);

  await page.locator(TID.chatInfoRename).click();
  await page.locator(TID.chatInfoNameInput).fill(renamed);
  await page.locator(TID.chatInfoNameSave).click();

  // After save, the header reflects the new name.
  await expect(page.locator(TID.chatInfoName)).toHaveText(renamed);
});
