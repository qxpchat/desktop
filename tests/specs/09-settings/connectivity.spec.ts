// Phase 9 — Settings: Connectivity.
//
// Asserts the Relays list actually surfaces the configured account's
// transport — not just that the page mounts. `list_transports_ex` is
// what populates the list; if its serialization or wiring breaks the
// row simply doesn't appear.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Connectivity: lists at least one relay matching the configured account', async ({ qxpPaired, page }) => {
  const { mainAccount } = qxpPaired;
  await openSettings(page, 'connectivity');

  // At least one relay row, addressed to the configured account.
  await expect(page.locator(TID.settingsConnectivityRelayByAddr(mainAccount.email))).toBeVisible({
    timeout: 10_000,
  });
});
