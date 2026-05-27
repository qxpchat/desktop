// Phase 5 — "New Email" affordance gating.
//
// The chatmail-relay account that the test pool registers reports
// `is_chatmail = '1'`, so the compose pane must NOT surface the
// "New Email" action — those accounts can't send unencrypted email
// (the relay rejects it). We pin that gate here. Email-based
// (non-chatmail) accounts are not exercised in the suite — they
// would need a classic IMAP/SMTP test server.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('compose pane hides the New Email action on chatmail accounts', async ({ qxpPaired, page }) => {
  void qxpPaired;
  await page.locator(TID.composeButton).click();
  await expect(page.locator(TID.composePane)).toBeVisible();
  await expect(page.locator(TID.composePaneNewEmail)).toHaveCount(0);
});
