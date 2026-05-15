// Phase 7 — paste a QR into the dispatcher.
//
// Headless Chromium can't read a real camera, so the Scanner errors
// out with a permission/availability message. The fallback paste
// input feeds the exact same `check_qr` pipeline: enter a known QR
// string, dispatcher recognises it and surfaces the kind-specific
// confirmation card.
//
// We use the peer's own setup-contact QR (which we fetch directly
// from peer's daemon) so the test exercises a real, dynamic QR
// rather than a fixed string that could rot with dc-core changes.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('paste a peer setup-contact QR → dispatcher shows the verify-contact card', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  // Pull peer's own setup-contact QR off its daemon.
  const peerQr = await peer.rpc.call<string>(
    'get_chat_securejoin_qr_code',
    [peer.accountId, null],
  );
  expect(peerQr).toMatch(/openpgp4fpr|i\.delta\.chat/i);

  // Open the QR dispatcher via compose → New Contact.
  await page.locator(TID.composeButton).click();
  await page.locator(TID.composePaneNewContact).click();
  await expect(page.locator(TID.qrDispatcher)).toBeVisible();

  // Paste-and-submit.
  await page.locator(TID.qrDispatcherPasteInput).fill(peerQr);
  await page.locator(TID.qrDispatcherPasteSubmit).click();

  // dc-core's `check_qr` returns a verify-contact card for a
  // setup-contact QR aimed at a contact we already key-exchanged
  // with (i.e. peer, since they're pre-paired). `askVerifyContact`
  // is the canonical kind for this case.
  const card = page.locator(TID.qrDispatcherCard);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toHaveAttribute('data-qr-kind', 'askVerifyContact');
});
