// Phase 9 — Settings: Profile.
//
// Open Settings → Profile, change display name, click Save, read the
// new value back through `get_config` on main's daemon.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Profile: rename round-trips through the daemon', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;
  const newName = `qxp test ${Date.now()}`;

  await openSettings(page, 'profile');

  // Save handles `await rpc.call('set_config', ['displayname', ...])`.
  await page.locator(TID.settingsProfileName).fill(newName);
  await page.locator(TID.settingsProfileSave).click();

  // Save button flashes "Saved" briefly — that's the visual ack.
  await expect(page.locator(TID.settingsProfileSave)).toContainText(/Saved|Save/);

  // Daemon-side readback confirms it persisted.
  const ids = await mainRpc.call<number[]>('get_all_account_ids');
  const stored = await mainRpc.call<string>('get_config', [ids[0], 'displayname']);
  expect(stored).toBe(newName);
});
