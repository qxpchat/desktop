// Phase 7 — joining a broadcast channel as a recipient.
//
// Peer creates an OutBroadcast channel and hands out its join QR. Main
// scans it via the QR dispatcher (askJoinBroadcast → secure_join) and
// lands in the resulting InBroadcast chat. As a recipient the channel is
// read-only, so we assert the two affordances that must NOT appear:
//   1. No composer — recipients can't post to a channel.
//   2. No "Invite QR" in chat-info — only the owner can mint a join code
//      (the daemon errors on get_chat_securejoin_qr_code otherwise).

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(90_000);

test('joined channel is read-only: no composer, no invite QR', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const channelName = `Bulletin ${Date.now()}`;

  // Peer owns the channel; pull its join QR straight off peer's daemon.
  const channelId = await peer.rpc.call<number>('create_broadcast', [
    peer.accountId,
    channelName,
  ]);
  const joinQr = await peer.rpc.call<string>('get_chat_securejoin_qr_code', [
    peer.accountId,
    channelId,
  ]);

  // Main scans it via compose → New Contact → QR dispatcher.
  await page.locator(TID.composeButton).click();
  await page.locator(TID.composePaneNewContact).click();
  await expect(page.locator(TID.qrDispatcher)).toBeVisible();

  await page.locator(TID.qrDispatcherPasteInput).fill(joinQr);
  await page.locator(TID.qrDispatcherPasteSubmit).click();

  const card = page.locator(TID.qrDispatcherCard);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toHaveAttribute('data-qr-kind', 'askJoinBroadcast');

  // Confirm → secure_join → ChatView mounts on the InBroadcast chat.
  await page.locator(TID.qrDispatcherConfirm).click();
  await expect(page.locator(TID.qrDispatcher)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(channelName, {
    timeout: 30_000,
  });

  // Bug 1: a recipient can't post — the composer must not render.
  await expect(page.locator(TID.composer)).toHaveCount(0, { timeout: 10_000 });

  // Bug 2: only the owner can mint an invite QR — the button must be gone.
  await page.locator(TID.chatTopbarInfo).click();
  await expect(page.locator(TID.chatInfo)).toBeVisible();
  await expect(page.locator(TID.chatInfoQrInvite)).toHaveCount(0);
});
