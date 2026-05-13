// Phase 9 — Settings: Blocked contacts.
//
// Block peer via daemon-side `block_contact` so the list has something
// to render → reload the section → assert peer's row is in the list →
// click Unblock → assert row disappears AND daemon-side blocked list
// is empty.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

type DaemonContact = { id: number; address: string };

test('Blocked: list reflects daemon state; unblock round-trips', async ({ qxpPaired, page }) => {
  const { mainRpc, peer } = qxpPaired;
  const accountId = (await mainRpc.call<number[]>('get_all_account_ids'))[0];

  // Resolve peer's contact id on main's side.
  const peerContactId = await mainRpc.call<number | null>('lookup_contact_id_by_addr', [accountId, peer.email]);
  expect(peerContactId).not.toBeNull();

  // Empty-state pre-condition.
  await openSettings(page, 'blocked');
  await expect(page.locator(TID.settingsBlockedEmpty)).toBeVisible();

  // Block daemon-side, then re-mount the section by swapping the active
  // rail item. Calling `openSettings` a second time would re-click the
  // chat-list burger button, which is hidden once Settings owns the
  // main pane — instead, drive the section switch directly.
  await mainRpc.call('block_contact', [accountId, peerContactId]);
  await page.locator(TID.settingsRailItem('chats')).click();
  await expect(page.locator(TID.settingsSectionBy('chats'))).toBeVisible();
  await page.locator(TID.settingsRailItem('blocked')).click();
  await expect(page.locator(TID.settingsSectionBy('blocked'))).toBeVisible();

  const row = page.locator(TID.settingsBlockedRowByAddress(peer.email));
  await expect(row).toBeVisible({ timeout: 5_000 });

  // Click Unblock → row disappears, daemon list is empty.
  await row.locator(TID.settingsBlockedUnblock).click();
  await expect(row).toHaveCount(0, { timeout: 5_000 });

  const blocked = await mainRpc.call<DaemonContact[]>('get_blocked_contacts', [accountId]);
  expect(blocked).toEqual([]);
});
