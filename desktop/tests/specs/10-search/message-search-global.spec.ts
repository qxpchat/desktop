// Phase 10 — global message-text search via the chat-list search.
//
// Type into the chat-list search input → debounced `search_messages`
// RPC runs → matching hits surface under a "Messages" section below
// the chat rows → clicking a hit jumps to the chat with the bubble
// highlighted.

import { test, expect } from '../../fixtures/app-paired.js';
import { waitForChatRowByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test('global search: typing a message hit opens the chat and flashes the bubble', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  // Use a unique substring so the search hit is unambiguous.
  const needle = `findme-${Date.now()}`;
  await peer.sendTo(`hello ${needle} world`);
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);

  await page.locator(TID.chatListSearch).fill(needle);

  // Messages section appears with at least one hit. The hit may not
  // surface immediately — peer.sendTo → IMAP delivery → main's DB
  // index can take a few seconds; `messageSearch` reruns on
  // IncomingMsg so we just outlast the arrival window.
  await expect(page.locator(TID.chatListSearchMessagesHeader)).toBeVisible({
    timeout: ARRIVAL_TIMEOUT_MS,
  });
  const hit = page.locator(TID.chatListSearchHit).first();
  await expect(hit).toBeVisible();

  // Click the hit → ChatView mounts with that chat selected, the
  // matching bubble visible AND flashed (jumpToMessage sets a 1.2s
  // `.flash` class on the targeted bubble — same mechanism Phase 13's
  // jump-from-quote test relies on).
  await hit.click();
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(peer.displayName);
  const bubble = page
    .locator(`[data-testid="message-bubble"]`, { hasText: needle })
    .first();
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveClass(/\bflash\b/);
});
