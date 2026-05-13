// Phase 8 — remove an account from the rail.
//
// Right-click an avatar tile → Remove… → confirm dialog → tile drops
// from the rail and the active selection falls back to the remaining
// account. We provision a second account so we can remove it without
// stranding the user on the empty onboarding (which is a separate
// edge case; see TODO at the bottom).

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(120_000);

async function provisionSecondAccount(rpc: { call<T>(method: string, params?: unknown[]): Promise<T> }, displayName: string): Promise<number> {
  // Preserve the active account — dc-core's add_account auto-selects
  // the new id, which would silently flip the UI away from main.
  const prevSelected = await rpc.call<number | null>('get_selected_account_id');
  const id = await rpc.call<number>('add_account');
  await rpc.call('set_config', [id, 'displayname', displayName]);
  await rpc.call('set_config_from_qr', [id, 'dcaccount:nine.testrun.org']);
  await rpc.call('configure', [id]);
  if (prevSelected != null) await rpc.call('select_account', [prevSelected]);
  return id;
}

test('right-click → Remove drops the tile from the rail', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;
  page.on('dialog', (d) => void d.accept());

  const secondId = await provisionSecondAccount(mainRpc, 'Throwaway');

  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  // Right-click the second tile.
  await page.locator(TID.navTabsAccountById(secondId)).click({ button: 'right' });
  await expect(page.locator(TID.navTabsAccountMenu)).toBeVisible();
  await page.locator(TID.navTabsAccountMenuRemove).click();

  // After the confirm() dialog auto-accepts, the tile is gone.
  await expect(page.locator(TID.navTabsAccountById(secondId))).toHaveCount(0);
  // The remaining account stays.
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(1);
});

// TODO: the "remove last account → empty-onboarding lands" path isn't
// covered here because the paired fixture's main account is the one
// the template-build pipeline depends on; nuking it would leave the
// rest of the suite in a torn-down state. Worth adding in Phase 9 or
// once we have an end-to-end-only fixture that doesn't share pool
// slots with the template build.
