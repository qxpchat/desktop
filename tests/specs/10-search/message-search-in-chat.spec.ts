// Phase 10 — in-chat search (Ctrl+F).
//
// Peer sends a small set of messages, main opens the chat. Ctrl+F
// opens the InChatSearch bar. Typing a substring shows the hit count.
// Next/Prev cycle through hits. Esc closes the bar.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test('Ctrl+F opens the find bar; next/prev/esc work', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  // Seed three messages all sharing the substring "alpha".
  await peer.sendTo('alpha one');
  await peer.sendTo('alpha two');
  await peer.sendTo('alpha three');

  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  // Wait until all three bubbles have arrived.
  for (const t of ['alpha one', 'alpha two', 'alpha three']) {
    await expect(
      page.locator(`[data-testid="message-bubble"]`, { hasText: t }),
    ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  }

  // Ctrl+F → bar appears.
  await page.keyboard.press('Control+f');
  await expect(page.locator(TID.inChatSearch)).toBeVisible();

  // Type "alpha" → count shows "1 / 3" (or "1 / N>=3").
  await page.locator(TID.inChatSearchInput).fill('alpha');
  await expect(page.locator(TID.inChatSearchCount)).toContainText(/1 \/ [3-9]\d?/);

  // Next → 2 / 3, then Prev → 1 / 3.
  await page.locator(TID.inChatSearchNext).click();
  await expect(page.locator(TID.inChatSearchCount)).toContainText(/2 \/ /);
  await page.locator(TID.inChatSearchPrev).click();
  await expect(page.locator(TID.inChatSearchCount)).toContainText(/1 \/ /);

  // Escape → bar closes.
  await page.keyboard.press('Escape');
  await expect(page.locator(TID.inChatSearch)).toHaveCount(0);
});
