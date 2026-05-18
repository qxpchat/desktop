// Phase 5 — delete a contact from the ComposePane list.
//
// qxp lists standalone contacts only in the "New conversation" pane, so
// that's where deletion lives: right-click a contact row → context menu
// → Delete contact → confirm.
//
// The list shows *key-contacts* — the only kind qxp ever creates, since
// contacts are added via QR / vCard and always carry a key. A
// `create_contact` address-contact (bare email, no key) never appears
// there, so the deletable contact has to be a real key-contact: we use
// the pre-paired peer.
//
// `delete_contact` hard-removes a contact with no chat history and merely
// hides (origin=Hidden) one still referenced by a chat — see
// deltachat-core `Contact::delete`. Either way the contact drops out of
// `get_contacts`, so the row disappears.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('right-click a contact → delete removes it from the list', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;

  await page.locator(TID.composeButton).click();
  await expect(page.locator(TID.composePane)).toBeVisible();

  // The paired peer is a key-contact → it shows in the contact list.
  const row = page.locator(TID.contactRowByName(peer.displayName));
  await expect(row).toBeVisible();

  // Right-click → context menu → Delete contact.
  await row.click({ button: 'right' });
  await expect(page.locator(TID.contactRowMenu)).toBeVisible();
  await page.locator(TID.contactRowMenuDelete).click();

  // Confirm in the danger dialog.
  await expect(page.locator(TID.composePaneDeleteContact)).toBeVisible();
  await page.locator(TID.confirmDialogConfirm).click();

  // `ContactsChanged` reloads the list — the row is gone.
  await expect(row).toHaveCount(0);
});
