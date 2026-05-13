// Phase 4 — reply to a message.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  sendComposerText,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test('reply quotes the targeted message in the outgoing bubble', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  const original = 'original from peer';
  await peer.sendTo(original);
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

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
});
