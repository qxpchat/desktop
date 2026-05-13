// Phase 13 — cross-cutting: Esc closes the active overlay.
//
// Three surfaces share the global Escape handler:
//   1. ChatRowMenu (right-click on a chat row).
//   2. Message ContextMenu (right-click on a bubble).
//   3. InChatSearch (Ctrl+F bar — has its own keydown listener, but
//      the global Escape dispatch also fires).
//
// We cover the chat-row and in-chat-search cases here; the message
// context menu's close-on-Esc is implicit in MessageBubble menus and
// would duplicate either Phase 4 or the chat-row menu coverage.

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName, waitForChatRowByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(60_000);

test('Esc closes the chat-row context menu', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await peer.sendTo('open the row menu');
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);

  const row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer.displayName}"]`,
  );
  await row.click({ button: 'right' });
  await expect(page.locator(TID.chatRowMenu)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator(TID.chatRowMenu)).toHaveCount(0);
});

test('Esc closes the InChatSearch bar', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await openChatByName(page, peer.displayName);
  await page.keyboard.press('Control+f');
  await expect(page.locator(TID.inChatSearch)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator(TID.inChatSearch)).toHaveCount(0);
});
