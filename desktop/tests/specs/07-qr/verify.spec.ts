// Phase 7 — verify a contact via QR (UI verify path).
//
// The plan's "verify" coverage was structurally satisfied by the
// template-build's offline secure_join, but the production UI verify
// path — pasting a setup-contact QR → tapping Confirm — went untested.
// This spec drives exactly that gesture:
//
//   1. Pull peer's setup-contact QR straight off peer's daemon.
//   2. Open QrDispatcher via compose → New Contact.
//   3. Paste + submit → dispatcher renders the verify-contact card.
//   4. Tap Confirm → the production handler calls `secure_join`, then
//      `onSelectChat(chatId)` and `backToChat()`.
//   5. The dispatcher unmounts; ChatView mounts on the peer's chat.
//
// We exercise the wiring end-to-end. The peer is already verified in
// the template, so the `secure_join` call is effectively a re-handshake;
// it's idempotent on dc-core's side — the round-trip path itself is what
// the UI test locks in.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(90_000);

test('verify-via-QR: paste + Confirm lands on peer\'s chat', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  // Pull peer's own setup-contact QR off peer's daemon (same trick the
  // scan-paste spec uses).
  const peerQr = await peer.rpc.call<string>(
    'get_chat_securejoin_qr_code',
    [peer.accountId, null],
  );

  // Open the dispatcher via compose → New Contact.
  await page.locator(TID.composeButton).click();
  await page.locator(TID.composePaneNewContact).click();
  await expect(page.locator(TID.qrDispatcher)).toBeVisible();

  await page.locator(TID.qrDispatcherPasteInput).fill(peerQr);
  await page.locator(TID.qrDispatcherPasteSubmit).click();

  const card = page.locator(TID.qrDispatcherCard);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toHaveAttribute('data-qr-kind', 'askVerifyContact');

  // Confirm → secure_join → ChatView for peer.
  await page.locator(TID.qrDispatcherConfirm).click();
  await expect(page.locator(TID.qrDispatcher)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(peer.displayName, {
    timeout: 30_000,
  });
});
