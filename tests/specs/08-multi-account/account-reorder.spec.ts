// Phase 8 — drag-reorder profile tiles in the rail (T005 / ACCT-002.6).
//
// dc-core has no notion of account ordering — order is whatever
// `get_all_account_ids` happens to return. The rail order is a local
// pref (`prefs.accountOrder`) applied via `applyAccountOrder` in
// `profiles.svelte.ts → refreshProfiles`. Each tile is HTML5-draggable;
// drop = splice the source id in *before* the drop target and persist.
//
// Playwright's `dragTo` synthesizes the mousedown/move/up sequence that
// triggers the native `dragstart`/`dragover`/`drop` events.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(180_000);

async function provisionSecondAccount(
  rpc: { call<T>(method: string, params?: unknown[]): Promise<T> },
  displayName: string,
): Promise<number> {
  const prevSelected = await rpc.call<number | null>('get_selected_account_id');
  const id = await rpc.call<number>('add_account');
  await rpc.call('set_config', [id, 'displayname', displayName]);
  await rpc.call('set_config_from_qr', [id, 'dcaccount:nine.testrun.org']);
  await rpc.call('configure', [id]);
  if (prevSelected != null) await rpc.call('select_account', [prevSelected]);
  return id;
}

test('drag-reorder profile tiles persists the new order', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;

  const firstId = await mainRpc.call<number>('get_selected_account_id') as number;
  const secondId = await provisionSecondAccount(mainRpc, 'Second');

  // Open the rail.
  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  // Initial order: first templated account, then "Second" (dc-core list
  // order at this point — pref is empty).
  const initial = await page.locator(TID.navTabsAccount).evaluateAll((els) =>
    els.map((el) => Number((el as HTMLElement).dataset.accountId)),
  );
  expect(initial).toEqual([firstId, secondId]);

  // Drag the second tile onto the first → splice-before → second goes to
  // position 0.
  await page.locator(TID.navTabsAccountById(secondId))
    .dragTo(page.locator(TID.navTabsAccountById(firstId)));

  await expect.poll(async () =>
    page.locator(TID.navTabsAccount).evaluateAll((els) =>
      els.map((el) => Number((el as HTMLElement).dataset.accountId)),
    ),
  ).toEqual([secondId, firstId]);

  // Persisted in localStorage as `qxp.web.prefs → accountOrder`. Re-read
  // the stored pref to assert the round-trip (not just the in-memory
  // `profiles.list`, which we already checked above).
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('qxp.web.prefs');
    return raw ? JSON.parse(raw).accountOrder : null;
  });
  expect(stored).toEqual([secondId, firstId]);
});
