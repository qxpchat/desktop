// Phase 9 — Settings: Proxy (sub-view of Connectivity).
//
// The shield icon in NavTabs deep-links to Settings → Connectivity →
// Proxy. We verify the deep-link lands on the Connectivity section.
// The proxy sub-view itself currently has no testid yet; full
// round-trip (add a proxy URL, observe the indicator flip) is a
// follow-up.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Proxy: shield-icon deep-link lands on Connectivity', async ({ page }) => {
  await page.locator(TID.chatListBurger).click();
  // The Proxy icon is the shield button in NavTabs' footer — it sets
  // mainRoute to settings/connectivity/proxy.
  await page.locator(TID.navTabsProxy).click();
  await expect(page.locator(TID.settings)).toHaveAttribute('data-active', 'connectivity');
});
