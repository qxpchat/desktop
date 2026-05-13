// Phase 4 — reply to a message.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  sendComposerText,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test('reply quotes the targeted message in the outgoing bubble', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  // Peer's chat row exists from the template — open it directly, then
  // wait for the actual incoming bubble. Waiting on the chat row would
  // return before IMAP delivered the message.
  const original = `original from peer ${Date.now()}`;
  await openChatByName(page, peer.displayName);
  await peer.sendTo(original);

  const incomingBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: original },
  );
  await expect(incomingBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  await incomingBubble.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('reply')).click();
  await expect(page.locator(TID.composerQuoteBar)).toBeVisible();

  await sendComposerText(page, 'replying to that');

  const outgoing = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"]`,
    { hasText: 'replying to that' },
  );
  await expect(outgoing).toBeVisible({ timeout: 10_000 });
  await expect(outgoing.locator(TID.messageBubbleQuote)).toContainText(original);

  // After send, the quote bar resets — a follow-up message is a plain text,
  // not another reply to the same thing.
  await expect(page.locator(TID.composerQuoteBar)).toHaveCount(0);
});

test('cancel reply: dismissing the quote bar drops the reply target', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  // The peer's chat row already exists in the template (from the
  // secure-join handshake), so `waitForChatRowByName` would return
  // before the message we care about has arrived via IMAP. Open the
  // chat first, then wait for the *bubble* — that's the right arrival
  // signal.
  const original = `cancel-me reply target ${Date.now()}`;
  await openChatByName(page, peer.displayName);
  await peer.sendTo(original);

  const incoming = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: original },
  );
  await expect(incoming).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Open reply → quote bar visible → cancel via the close button.
  await incoming.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('reply')).click();
  await expect(page.locator(TID.composerQuoteBar)).toBeVisible();
  await page.locator(TID.composerQuoteBarClose).click();
  await expect(page.locator(TID.composerQuoteBar)).toHaveCount(0);

  // Send a plain follow-up — the outgoing bubble must NOT carry a quote.
  await sendComposerText(page, 'no-quote follow up');
  const outgoing = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"]`,
    { hasText: 'no-quote follow up' },
  );
  await expect(outgoing).toBeVisible({ timeout: 10_000 });
  await expect(outgoing.locator(TID.messageBubbleQuote)).toHaveCount(0);
});
