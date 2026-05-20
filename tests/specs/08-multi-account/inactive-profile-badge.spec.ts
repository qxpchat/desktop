// Phase 8 — inactive-profile fresh-msg badge.
//
// Bug guard: when the user is viewing profile B and profile A receives a
// message, A's tile in the nav rail must light a badge as soon as the
// IncomingMsg event lands — without the user having to switch accounts
// first. Earlier behaviour: the badge only appeared after the next full
// `recomputeAllFreshCounts` (i.e. a B→A→B account switch), because
// `profiles.list[idx] = …` didn't re-trigger the `{#each}` rebind in
// NavTabs reliably for the inactive tile.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(180_000);

async function provisionSecondAccount(
  rpc: { call<T>(method: string, params?: unknown[]): Promise<T> },
  displayName: string,
): Promise<number> {
  // dc-core's `add_account` auto-selects the new account, which would
  // silently switch main away from the templated account A. Capture and
  // restore the prior selection so the test starts from a known state.
  const prevSelected = await rpc.call<number | null>('get_selected_account_id');
  const id = await rpc.call<number>('add_account');
  await rpc.call('set_config', [id, 'displayname', displayName]);
  await rpc.call('set_config_from_qr', [id, 'dcaccount:nine.testrun.org']);
  await rpc.call('configure', [id]);
  if (prevSelected != null) await rpc.call('select_account', [prevSelected]);
  return id;
}

test('badge appears on inactive profile A when a message arrives for A while B is selected', async ({ qxpPaired, page }) => {
  const { peer, mainRpc } = qxpPaired;

  const firstId = await mainRpc.call<number>('get_selected_account_id') as number;
  const secondId = await provisionSecondAccount(mainRpc, 'Second');

  // Open the profile rail so the nav tiles are visible, then switch to B.
  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  await page.locator(TID.navTabsAccountById(secondId)).click();

  // B is now the selected tile — its own badge would never render. A is
  // inactive; its badge starts hidden because A has no fresh messages yet.
  await expect(page.locator(TID.navTabsAccountBadgeById(firstId))).toHaveCount(0);

  // Peer sends to A while B is selected. The IncomingMsg event must drive
  // A's freshCount → badge, without any account switch on main.
  await peer.sendTo('ping while A is inactive');

  await expect(page.locator(TID.navTabsAccountBadgeById(firstId)))
    .toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  await expect(page.locator(TID.navTabsAccountBadgeById(firstId)))
    .toHaveText('1');
});
