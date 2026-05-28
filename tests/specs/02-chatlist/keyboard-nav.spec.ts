// Phase 2 — keyboard chat navigation (T044 / CHATLIST-018).
//
// Alt+↓ / Alt+↑ (also Ctrl+PageDown/PageUp) move to the next / previous chat
// in the visible list order, wrapping at the ends — so a desktop user can
// flip through conversations without the mouse. Bindings live in the shared
// `SHORTCUTS` table (lib/shortcuts.ts); `ChatListPane` registers the handler.

import { test, expect } from '../../fixtures/app-trio.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test('Alt+Arrow navigates to the next / previous chat', async ({ qxpTrio, page }) => {
  const { peer1, peer2 } = qxpTrio;
  await peer1.sendTo('one');
  await peer2.sendTo('two');

  const row1 = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`,
  );
  const row2 = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer2.displayName}"]`,
  );
  await expect(row1).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  await expect(row2).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Open row1 as a known starting point.
  await row1.click();
  await expect(row1).toHaveAttribute('aria-pressed', 'true');

  // Alt+↓ moves off row1 to the next chat in order.
  await page.keyboard.press('Alt+ArrowDown');
  await expect(row1).toHaveAttribute('aria-pressed', 'false');
  // Some other row is now the active chat.
  await expect(
    page.locator('[data-testid="chat-list-row"][aria-pressed="true"]'),
  ).toHaveCount(1);

  // Alt+↑ returns to row1 (down-then-up is symmetric, wrap-safe).
  await page.keyboard.press('Alt+ArrowUp');
  await expect(row1).toHaveAttribute('aria-pressed', 'true');
});
