// Phase 3 — text message send + receive.
//
// Canary for the messaging pipeline AND the paired-fixture path. Uses
// `app-paired` so the test starts with peer↔main already verified — no
// manual login, no `pairPeerWithMain` round-trip. That's what cuts the
// per-test wallclock from ~30-90s down to ~5-10s.
//
// Verifies:
//   - peer → main: bubble surfaces with the expected text.
//   - main → peer: outgoing bubble walks pending → delivered → read.
//     The final read step needs an MDN, which peer.markSeen emits.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  sendComposerText,
  waitForOutgoingRead,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS, DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(300_000);

test('text message round-trips between peer and main with full state glyph progression', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;

  // ---- peer → main ----
  // Peer's chat row exists in the template; open it directly, then send
  // and wait for the actual incoming bubble.
  await openChatByName(page, peer.displayName);
  const incoming = `ping from peer ${Date.now()}`;
  await peer.sendTo(incoming);

  const incomingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: incoming },
  );
  await expect(incomingBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  await expect(incomingBubble.locator(TID.messageBubbleText)).toContainText(incoming);

  // ---- main → peer ----
  const outgoing = 'pong from main';
  await sendComposerText(page, outgoing);

  const outgoingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"]`,
    { hasText: outgoing },
  );
  await expect(outgoingBubble).toBeVisible({ timeout: 5_000 });
  await expect(outgoingBubble).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });

  await waitForOutgoingRead(peer, outgoingBubble);
  await expect(outgoingBubble).toHaveAttribute('data-state', 'read');
});
