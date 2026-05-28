// Phase 3 — chat-view keyboard shortcuts (T044).
//
// open-gallery (Cmd/Ctrl+Shift+G) opens the current chat's media browser;
// focus-composer (Ctrl+M) drops the caret into the message box — both so
// common flows work without the mouse. Bindings live in lib/shortcuts.ts.

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Ctrl+Shift+G opens the chat media gallery', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await openChatByName(page, peer.displayName);

  await page.keyboard.press('Control+Shift+G');
  await expect(page.locator(TID.mediaBrowser)).toBeVisible({ timeout: 10_000 });
});

test('Ctrl+M focuses the composer', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await openChatByName(page, peer.displayName);

  // Move focus to the chat-list search first (doesn't navigate away) so the
  // assertion is meaningful.
  await page.locator(TID.chatListSearch).focus();
  await page.keyboard.press('Control+m');
  await expect(page.locator(TID.composerTextarea)).toBeFocused();
});
