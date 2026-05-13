// Phase 6 — remove a member from a group.
//
// Members list shows self + peer. We tap Remove on peer's row. The
// confirm() dialog is auto-accepted via page.on('dialog'). After
// the RPC + reload, peer's row drops out of the list.

import { test, expect } from '../../fixtures/app-paired.js';
import { createGroupAndOpenInfo } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('remove-member: peer disappears from the members list after confirm', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  page.on('dialog', (d) => void d.accept());

  await createGroupAndOpenInfo(page, peer.displayName, `Rm ${Date.now()}`);

  const peerRow = page.locator(TID.chatInfoMemberByName(peer.displayName));
  await expect(peerRow).toBeVisible();
  await peerRow.locator(TID.chatInfoMemberRemove).click();

  await expect(peerRow).toHaveCount(0);
});
