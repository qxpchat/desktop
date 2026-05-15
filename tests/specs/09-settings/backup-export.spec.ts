// Phase 9 — Settings: Backup export.
//
// Drives the actual export. `export_backup` writes a .tar into the daemon's
// uploads dir and fires ImexProgress events; the UI flips status `idle →
// exporting → ready`. We don't actually download the file — its size is
// account-dependent and the proxy serves it via /file/... which is its
// own surface. The status round-trip is what the user can see.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(180_000);

test('Backup: Export flips status idle → exporting → ready', async ({ page }) => {
  await openSettings(page, 'backup');

  const statusEl = page.locator(TID.settingsBackupStatus);
  await expect(statusEl).toHaveAttribute('data-status', 'idle');

  // The Export row triggers `export_backup`. Click via the wrapping span's
  // `<button>`.
  await page.locator(`${TID.settingsBackupExport} button`).click();

  // Status transitions: 'exporting' (with progress) → 'ready' once
  // ImexProgress=1000 lands. The first transition can be fast on a small
  // account — accept either next state.
  await expect(statusEl).toHaveAttribute('data-status', /(exporting|ready)/, {
    timeout: 5_000,
  });
  await expect(statusEl).toHaveAttribute('data-status', 'ready', {
    timeout: 120_000,
  });

  // Once ready, the Download link surfaces with a usable href.
  // qxp-web serves backups from `/file?path=…` (query-string, not a path
  // segment), so the URL shape is `/file?path=...&...`. Accept that plus
  // any absolute URL for cross-platform tolerance, and verify the
  // payload points at a .tar.
  const dl = page.locator(TID.settingsBackupDownload);
  await expect(dl).toBeVisible();
  const href = await dl.getAttribute('href');
  expect(href).toMatch(/^https?:\/\/.+|^\/file/);
  expect(href).toContain('.tar');
});
