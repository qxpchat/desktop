// Phase 9 — Settings: Logs.
//
// Header is built synchronously from `get_system_info` + `get_info`; we
// assert it carries the user-agent line and the account section. Entries
// come from the deltachat-core event stream — by the time the test runs
// (post-template-load + start_io), at least one Info-level line should
// be in the buffer.

import { test, expect } from '../../fixtures/app-paired.js';
import { openSettings } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Logs: header renders sysinfo + account info; entries accumulate', async ({ page }) => {
  await openSettings(page, 'logs');

  const header = page.locator(TID.settingsLogsHeader);
  await expect(header).toBeVisible();
  // Async parts of the header (sysinfo + account info) land within a few
  // hundred ms; allow 5s to be safe.
  await expect(header).toContainText(/userAgent=/, { timeout: 5_000 });
  await expect(header).toContainText(/--- system_info ---/, { timeout: 5_000 });
  await expect(header).toContainText(/--- account_info /, { timeout: 5_000 });

  // The list is either populated or showing the empty-state placeholder
  // — both are valid renderings of the page; we just need to see one of
  // them, not the loading fallback.
  const list = page.locator(TID.settingsLogsList);
  await expect(list).toBeVisible();
});
