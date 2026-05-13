// Phase 9 — Settings: Backup export.
//
// TODO: the backup-export flow opens a file save dialog (`<input
// type="file" />`-style picker invocation isn't symmetric here — the
// SPA calls `imex` with a daemon-side path). Exercising the full
// round-trip needs either a stubbed file destination or the daemon's
// imex events plumbed into the test fixture. Section reachability is
// covered by the navigation in `openSettings`; the round-trip stays
// a TODO.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Backup: section is reachable', async ({ page }) => {
  await openSettings(page, 'backup');
  await expect(page.locator(TID.settingsSectionBy('backup'))).toBeVisible();
});
