// Phase 9 — Settings: Add Second Device.
//
// The send-backup / multi-device flow. `provide_backup` starts a
// local-network backup provider and blocks until a peer pulls the
// account (or `stop_ongoing_process` cancels it); `get_backup_qr` +
// `create_qr_svg` yield the DCBACKUP pair code + QR. The receiving half
// is `get_backup` (driven headlessly here).
//
// Coverage:
//  1. provider starts, QR + code render, Cancel tears it back to idle.
//  2. round-trip — a fresh account on the peer daemon runs `get_backup`
//     against the code, the page reaches stage 'done'.
//  3. regression — the old, broken "pair QR" row is gone from Backup.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(180_000);

test('Add Second Device: provider starts, renders pairing QR + code, cancels to idle', async ({
  page,
}) => {
  await openSettings(page, 'add-device');

  const container = page.locator(TID.settingsAddDevice);
  await expect(container).toHaveAttribute('data-stage', 'idle');

  await page.locator(TID.settingsAddDeviceStart).click();

  // `get_backup_qr` blocks until the provider is ready (core caps it at
  // 60s). Once the SVG lands the stage flips to 'awaiting'.
  await expect(page.locator(TID.settingsAddDeviceQr)).toBeVisible({
    timeout: 60_000,
  });
  await expect(container).toHaveAttribute('data-stage', 'awaiting');
  await expect(page.locator(`${TID.settingsAddDeviceQr} svg`)).toBeVisible();

  // The code is shown verbatim so it can be copied / pasted on the peer.
  const code = (await page.locator(TID.settingsAddDeviceCode).textContent())?.trim();
  expect(code).toMatch(/^DCBACKUP\d*:/i);

  // Cancel calls `stop_ongoing_process`; `provide_backup` then resolves
  // and the section returns to idle.
  await page.locator(TID.settingsAddDeviceCancel).click();
  await expect(container).toHaveAttribute('data-stage', 'idle', {
    timeout: 30_000,
  });
});

test('Add Second Device: round-trip — a fresh peer account receives the backup', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;
  await openSettings(page, 'add-device');
  await page.locator(TID.settingsAddDeviceStart).click();

  await expect(page.locator(TID.settingsAddDeviceQr)).toBeVisible({
    timeout: 60_000,
  });
  const code = (await page.locator(TID.settingsAddDeviceCode).textContent())?.trim();
  expect(code).toMatch(/^DCBACKUP\d*:/i);

  // Headless receiver: a brand-new account on the peer daemon pulls the
  // backup from the page's account over the local network — the same
  // transfer a second physical device would do.
  const recvId = await peer.rpc.call<number>('add_account');
  await peer.rpc.call('get_backup', [recvId, code]);

  // `provide_backup` on the page side resolves once the peer finishes,
  // flipping the stage to 'done'.
  await expect(page.locator(TID.settingsAddDevice)).toHaveAttribute(
    'data-stage',
    'done',
    { timeout: 120_000 },
  );
});

test('Backup section no longer offers a device-pairing QR', async ({ page }) => {
  // Regression: the pair-QR row used to live in Backup and generated a
  // securejoin contact QR (wrong — not a DCBACKUP transfer code). It now
  // lives in its own "Add Second Device" section with the real flow.
  await openSettings(page, 'backup');
  const section = page.locator(TID.settingsSectionBy('backup'));
  await expect(section).toBeVisible();
  await expect(section.getByText('Show pair QR')).toHaveCount(0);
  await expect(section.getByText('Pair another device')).toHaveCount(0);
});
