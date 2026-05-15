// Phase 3 — one-shot location share.
//
// Two specs in one file:
//
//   1. Full state-glyph progression `pending → delivered → read`.
//      Requires a visible body part — dc-core only attaches `WantsMdn`
//      to `parts.last_mut()` in `mimeparser.rs::parse_attachments`, and
//      `parts` only contains *visible* text/file parts. A location-only
//      message has zero visible parts → receiver never sets WantsMdn →
//      receiver never sends an MDN → sender bubble never reaches `read`.
//      We give the composer a body so the protocol round-trip works.
//
//   2. Empty-body location (no text). This is a valid user gesture —
//      the composer allows tapping Send Location with an empty textarea
//      — but per the quirk above, the outgoing bubble only reaches
//      `delivered`, never `read`. Lock that exact behaviour in so a
//      future protocol change (visible-by-default location parts) is
//      noticed.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  waitForChatRowByName,
  waitForOutgoingRead,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS, DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(180_000);

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4040' });
  await context.setGeolocation({ latitude: 52.52, longitude: 13.405 });
});

test('location share with a body round-trips with full state glyph progression', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await peer.sendAttachment({
    viewtype: 'Text',
    text: 'around there',
    location: [48.8566, 2.3522],
  });
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  const incomingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"][data-has-location="true"]`,
  ).first();
  await expect(incomingBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Body text required to land the MDN; see header comment.
  await page.locator(TID.composerTextarea).fill('here we are');
  await page.locator(TID.composerAttach).click();
  await page.locator(TID.attachMenuItem('location')).click();
  await expect(page.locator(TID.locationPicker)).toBeVisible();
  const sendBtn = page.locator(TID.locationPickerSend);
  await expect(sendBtn).toBeEnabled({ timeout: 10_000 });
  await sendBtn.click();

  const outgoingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-has-location="true"]`,
  ).first();
  await expect(outgoingBubble).toBeVisible({ timeout: 10_000 });
  await expect(outgoingBubble).toHaveAttribute('data-state', 'delivered', { timeout: DELIVERED_TIMEOUT_MS });
  await waitForOutgoingRead(peer, outgoingBubble, 150_000);
  await expect(outgoingBubble).toHaveAttribute('data-state', 'read');
});

test('empty-body location reaches delivered but not read (protocol-known)', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await openChatByName(page, peer.displayName);

  // Composer body intentionally empty.
  await expect(page.locator(TID.composerTextarea)).toHaveValue('');
  await page.locator(TID.composerAttach).click();
  await page.locator(TID.attachMenuItem('location')).click();
  await expect(page.locator(TID.locationPicker)).toBeVisible();
  const sendBtn = page.locator(TID.locationPickerSend);
  await expect(sendBtn).toBeEnabled({ timeout: 10_000 });
  await sendBtn.click();

  const outgoingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-has-location="true"]`,
  ).first();
  await expect(outgoingBubble).toBeVisible({ timeout: 10_000 });
  await expect(outgoingBubble).toHaveAttribute('data-state', 'delivered', { timeout: DELIVERED_TIMEOUT_MS });

  // Drive peer's markseen path — should still find no fresh visible part
  // to attach an MDN to, so main's bubble stays at `delivered`.
  await peer.markSeen(15_000);
  await new Promise((r) => setTimeout(r, 5_000));
  await expect(outgoingBubble).toHaveAttribute('data-state', 'delivered');
});
