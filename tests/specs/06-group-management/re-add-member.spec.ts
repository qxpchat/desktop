// Phase 6 — re-add a previously removed member.
//
// Regression: the add-member picker used to exclude `pastContactIds`
// (kicked / left members), so anyone you removed by accident became
// un-re-addable from the group UI. The picker now only excludes
// current members; past members must reappear and be addable.
//
// Flow:
//   1. Create a group with peer.
//   2. Remove peer (peer now in pastContactIds).
//   3. Open add-member picker → peer's row is visible.
//   4. Add peer back → peer is in the members list again.

import { test, expect } from '../../fixtures/app-paired.js';
import { createGroupAndOpenInfo } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(90_000);

test('re-add-member: previously removed peer reappears in the add-member picker', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;

  await createGroupAndOpenInfo(page, peer.displayName, `Re-add ${Date.now()}`);

  // Remove peer first — pushes peer into pastContactIds.
  const peerRow = page.locator(TID.chatInfoMemberByName(peer.displayName));
  await expect(peerRow).toBeVisible();
  await peerRow.locator(TID.chatInfoMemberRemove).click();
  await page.locator(TID.confirmDialogConfirm).click();
  await expect(peerRow).toHaveCount(0);

  // Open the picker — peer must be listed despite being a past member.
  await page.locator(TID.chatInfoAddMember).click();
  await expect(page.locator(TID.chatInfoAddMemberDialog)).toBeVisible();
  const pickerRow = page.locator(TID.chatInfoAddMemberRowByAddress(peer.email));
  await expect(pickerRow).toBeVisible({ timeout: 5_000 });

  // Confirm the re-add round-trips: tap → confirm → row back in members.
  await pickerRow.click();
  await page.locator(TID.chatInfoAddMemberConfirm).click();
  await expect(page.locator(TID.chatInfoAddMemberDialog)).toHaveCount(0);
  await expect(peerRow).toBeVisible({ timeout: 5_000 });
});
