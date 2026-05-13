// Phase 13 — cross-cutting: tapping a quote jumps to the quoted bubble.
//
// Peer sends an original message, then a follow-up that quotes it via
// `quotedMessageId`. Main opens the chat; tapping the quote on the
// follow-up flashes the original bubble (`.flash` class, ~1.2s).
//
// Plan also calls for "target outside loaded window → paginates". qxp's
// `jumpToMessage` paginates if the target isn't in the loaded window;
// seeding enough scrollback to trip that case requires dozens of
// messages. We cover the *wiring* here with a single quote pair and
// leave the pagination edge case as a follow-up once we have a
// `peer.sendBurst` helper.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test('tapping a quote flashes the quoted bubble', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const stamp = Date.now();
  const originalText = `quoted ${stamp}`;
  const replyText = `reply ${stamp}`;

  // Peer sends the original, captures its peer-side msg id.
  const peerOriginalId = await peer.sendTo(originalText);

  // Peer sends the reply quoting the original. `peer.sendAttachment`
  // accepts `quotedMessageId` via `send_msg`'s MessageData shape —
  // call the daemon RPC directly to bypass the wrapper's narrow type.
  await peer.rpc.call('send_msg', [
    peer.accountId,
    peer.pairedChatId,
    { viewtype: 'Text', text: replyText, quotedMessageId: peerOriginalId },
  ]);

  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  // The reply carries a quote child.
  const replyBubble = page
    .locator(`[data-testid="message-bubble"]`, { hasText: replyText })
    .filter({ has: page.locator(TID.messageBubbleQuote) })
    .first();
  await expect(replyBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  const originalBubble = page
    .locator(`[data-testid="message-bubble"]`, { hasText: originalText })
    .first();
  await expect(originalBubble).toBeVisible();

  // Tap the quote → `jumpToMessage` → `chat.highlightId` set →
  // original bubble's `class:flash` activates.
  await replyBubble.locator(TID.messageBubbleQuote).click();
  await expect(originalBubble).toHaveClass(/\bflash\b/);
});
