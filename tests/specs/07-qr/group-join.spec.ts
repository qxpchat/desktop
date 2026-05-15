// Phase 7 — group-invite QR.
//
// Main creates a group and opens its Invite QR. We assert:
//   1. QrShow scopes to the chat (`data-scope="chat"`) and renders.
//   2. The URL line carries the qxp-hosted invite link.
//   3. Converted back to openpgp4fpr (as QrShow.paste does), the code
//      is parseable as a group-invite by `check_qr` from a separate
//      account context (peer's daemon).
//
// Why we don't go all the way to "peer joins, peer appears as member":
// the compose-flow's ChooseMembers requires at least one member to
// enable Next, so peer is already in the group by the time the QR is
// generated — `secure_join` would be a no-op verify rather than a
// real join, and asserting "member already exists" tests nothing.
// A genuine join needs a 3rd unverified account; tracking that as
// future work alongside `verify.spec.ts`.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(90_000);

test('group invite QR renders and is parseable as a group-join code', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const groupName = `Join ${Date.now()}`;

  // Create a group with peer (the picker requires ≥1 member).
  await page.locator(TID.composeButton).click();
  await page.locator(TID.composePaneNewGroup).click();
  await page.locator(TID.contactRowByName(peer.displayName)).first().click();
  await page.locator(TID.chooseMembersNext).click();
  await page.locator(TID.groupMetadataName).fill(groupName);
  await page.locator(TID.groupMetadataCreate).click();
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(groupName);

  // Open chat-info → Invite QR.
  await page.locator(TID.chatTopbarInfo).click();
  await expect(page.locator(TID.chatInfo)).toBeVisible();
  await page.locator(TID.chatInfoQrInvite).click();

  await expect(page.locator(TID.qrShow)).toHaveAttribute('data-scope', 'chat');
  await expect(page.locator(TID.qrShowCard)).toBeVisible({ timeout: 10_000 });

  const groupQr = await page.locator(TID.qrShowUrl).textContent();
  expect(groupQr).toBeTruthy();
  expect(groupQr).toMatch(/^https:\/\/qxp\.chat\/invite\.html#./);

  // The displayed link is the qxp landing page; check_qr only groks the
  // openpgp4fpr scheme. Convert back the same way QrShow.paste does.
  const openpgp4fpr = `OPENPGP4FPR:${groupQr!
    .replace(/^https:\/\/qxp\.chat\/invite\.html\/?#/i, '')
    .replace('&', '#')}`;

  // Cross-check from peer's daemon — `check_qr` returns a group-shaped
  // kind for a group invite. Peer is already a member (chooseMembers
  // required ≥1), so the kind is `reviveVerifyGroup` (already-joined,
  // could be revived) rather than `askVerifyGroup`.
  const parsed = await peer.rpc.call<{ kind: string }>('check_qr', [
    peer.accountId,
    openpgp4fpr,
  ]);
  expect(['askVerifyGroup', 'reviveVerifyGroup']).toContain(parsed.kind);
});
