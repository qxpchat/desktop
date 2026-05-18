// Phase 5 — delete a contact from the ComposePane list.
//
// qxp lists standalone contacts only in the "New conversation" pane, so
// that's where deletion lives: right-click a contact row → context menu
// → Delete contact → confirm. Covers the "no chat with them" case — the
// contact is provisioned with `create_contact` (address book only, no
// chat), which the daemon hard-removes on delete.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('right-click a no-chat contact → delete removes it from the list', async ({
  qxpPaired,
  page,
}) => {
  const { mainRpc } = qxpPaired;

  // Provision a throwaway contact with no chat — the exact case the
  // feature targets. `create_contact` only touches the address book.
  const [accountId] = await mainRpc.call<number[]>('get_all_account_ids');
  const name = `DeleteMe-${Date.now()}`;
  await mainRpc.call('create_contact', [accountId, `${name}@example.org`, name]);

  await page.locator(TID.composeButton).click();
  await expect(page.locator(TID.composePane)).toBeVisible();

  const row = page.locator(TID.contactRowByName(name));
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
