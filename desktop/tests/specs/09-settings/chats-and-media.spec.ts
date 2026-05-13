// Phase 9 — Settings: Chats & Media.
//
// The read-receipts toggle (mdns_enabled) is the one knob in this pane
// the rest of the suite depends on (Phase 3+ assumes peers send MDNs).
// Drive it through the UI and verify both the daemon config flipped AND
// the toggle reflects the daemon-side state on a fresh open.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Chats & Media: read-receipts toggle round-trips through the daemon', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;
  const accountId = (await mainRpc.call<number[]>('get_all_account_ids'))[0];

  await openSettings(page, 'chats');
  await expect(page.locator(TID.settingsSectionBy('chats'))).toBeVisible();

  // The template configures mdns_enabled=1 explicitly (see ensure-pool.mjs).
  await expect(page.locator(TID.settingsChatsMdns)).toHaveAttribute('data-checked', 'true');
  expect(await mainRpc.call<string | null>('get_config', [accountId, 'mdns_enabled'])).toBe('1');

  // Toggle off via the UI.
  await page.locator(`${TID.settingsChatsMdns} [role="switch"]`).click();
  await expect(page.locator(TID.settingsChatsMdns)).toHaveAttribute('data-checked', 'false');
  expect(await mainRpc.call<string | null>('get_config', [accountId, 'mdns_enabled'])).toBe('0');

  // Toggle back on.
  await page.locator(`${TID.settingsChatsMdns} [role="switch"]`).click();
  await expect(page.locator(TID.settingsChatsMdns)).toHaveAttribute('data-checked', 'true');
  expect(await mainRpc.call<string | null>('get_config', [accountId, 'mdns_enabled'])).toBe('1');
});
