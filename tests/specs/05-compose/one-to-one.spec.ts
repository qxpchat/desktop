// Phase 5 — 1:1 chat creation via the compose pane.
//
// Open the compose pane → pick the (pre-paired) peer's contact row → a
// 1:1 chat opens in the main pane with the peer's display name in the
// topbar. `create_chat_by_contact_id` is idempotent: since the template
// already has a verified-1on1 chat with peer, this re-opens it rather
// than creating a duplicate.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('compose → existing contact opens the 1:1 chat with that peer', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  // Open the compose pane.
  await page.locator(TID.composeButton).click();
  await expect(page.locator(TID.composePane)).toBeVisible();

  // Tap peer's contact row. The contact is in the list because the
  // template's secure_join handshake created it.
  await page.locator(TID.contactRowByName(peer.displayName)).first().click();

  // Compose pane closes and ChatView mounts with peer's chat selected.
  await expect(page.locator(TID.composePane)).toHaveCount(0);
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(peer.displayName);
});
