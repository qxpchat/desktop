// Phase 13 — cross-cutting: global keyboard shortcuts.
//
// `lib/shortcuts.ts` registers four window-scoped chords:
//   - Cmd/Ctrl+N → "new-chat"     (opens the compose pane)
//   - Cmd/Ctrl+K → "focus-search" (focuses the chat-list search input)
//   - Cmd/Ctrl+F → "in-chat-search" (opens InChatSearch when a chat
//                  has a registered handler — i.e. a chat is open)
//   - Escape    → "escape"       (closes the active surface, tested
//                  in escape-handling.spec.ts)

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Ctrl+N opens the compose pane', async ({ page }) => {
  await page.keyboard.press('Control+n');
  await expect(page.locator(TID.composePane)).toBeVisible();
});

test('Ctrl+K focuses the chat-list search input', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const isFocused = await page
    .locator(TID.chatListSearch)
    .evaluate((el) => el === document.activeElement);
  expect(isFocused).toBe(true);
});

test('Ctrl+F inside a chat opens the InChatSearch bar', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await openChatByName(page, peer.displayName);
  await page.keyboard.press('Control+f');
  await expect(page.locator(TID.inChatSearch)).toBeVisible();
});
