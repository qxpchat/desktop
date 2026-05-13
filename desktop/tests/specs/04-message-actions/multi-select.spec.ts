// Phase 4/5 — multi-message selection + bulk delete.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test('select-more + bulk delete removes all selected bubbles', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  const texts = ['m1', 'm2', 'm3', 'm4', 'm5'];
  for (const t of texts) await peer.sendTo(t);

  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  for (const t of texts) {
    await expect(
      page.locator(
        `[data-testid="message-bubble"][data-direction="incoming"]`,
        { hasText: t },
      ),
    ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  }

  const firstBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: 'm1' },
  );
  await firstBubble.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('select-more')).click();
  await expect(page.locator(TID.selectionBar)).toBeVisible();

  // In selection mode `.bubble-wrap` has `pointer-events: none` so clicks
  // pass to the parent `.row` — force the click on the bubble locator.
  for (const t of ['m2', 'm3', 'm4', 'm5']) {
    await page.locator(
      `[data-testid="message-bubble"][data-direction="incoming"]`,
      { hasText: t },
    ).click({ force: true });
  }

  await expect(page.locator(TID.selectionBar)).toHaveAttribute('data-count', '5');

  await page.locator(TID.selectionBarDelete).click();
  await expect(page.locator(TID.deleteMsgDialog)).toBeVisible();
  await page.locator(TID.deleteMsgDialogForMe).click();

  for (const t of texts) {
    await expect(
      page.locator(
        `[data-testid="message-bubble"]`,
        { hasText: t },
      ),
    ).toHaveCount(0);
  }
  await expect(page.locator(TID.selectionBar)).toHaveCount(0);
});
