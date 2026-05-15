// Phase 9 — Settings: Profile.
//
// Open Settings → Profile, change display name, click Save, read the
// new value back through `get_config` on main's daemon.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4040',
  });
});

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

test('Profile: shows fingerprint with copy button', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;

  await openSettings(page, 'profile');

  const fpEl = page.locator(TID.settingsProfileFingerprint);
  await expect(fpEl).toBeVisible({ timeout: 10_000 });

  const displayedFp = (await fpEl.textContent()) ?? '';
  expect(displayedFp.length).toBeGreaterThan(0);
  expect(displayedFp).toMatch(/^[0-9A-F ]+$/i);

  const fpRaw = displayedFp.replace(/\s/g, '').toUpperCase();

  const ids = await mainRpc.call<number[]>('get_all_account_ids');
  const info = await mainRpc.call<Record<string, string>>('get_info', [ids[0]]);
  expect(info.fingerprint?.toUpperCase()).toBe(fpRaw);

  const copyBtn = page.locator(TID.settingsProfileFingerprintCopy);
  await expect(copyBtn).toBeVisible();

  await copyBtn.click();
  await expect(copyBtn).toContainText(/Copied/);

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(fpRaw);
});
