// Phase 4/5 — multi-message selection: bulk delete + bulk forward.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  createGroupChat,
  openChatByName,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(180_000);

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

test('select-more + bulk forward routes all selected bubbles into a target chat', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  // 1. Create a distinct destination chat (group with peer) first so the
  //    picker has something to find.
  const groupName = `Bulk fwd ${Date.now()}`;
  await createGroupChat(page, peer.displayName, groupName);

  // 2. Switch to the 1:1 and seed three peer messages; wait for each bubble.
  await openChatByName(page, peer.displayName);
  const stamp = Date.now();
  const texts = [`bulk-fwd-a ${stamp}`, `bulk-fwd-b ${stamp}`, `bulk-fwd-c ${stamp}`];
  for (const t of texts) await peer.sendTo(t);
  for (const t of texts) {
    await expect(
      page.locator(`[data-testid="message-bubble"][data-direction="incoming"]`, { hasText: t }),
    ).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  }

  // 3. Enter selection mode on first bubble, click-toggle the rest.
  const firstBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: texts[0] },
  );
  await firstBubble.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('select-more')).click();
  await expect(page.locator(TID.selectionBar)).toBeVisible();

  for (const t of texts.slice(1)) {
    await page.locator(
      `[data-testid="message-bubble"][data-direction="incoming"]`,
      { hasText: t },
    ).click({ force: true });
  }
  await expect(page.locator(TID.selectionBar)).toHaveAttribute('data-count', String(texts.length));

  // 4. Bulk Forward → selection-bar exits, chat picker opens. Pick the
  //    group: it opens and a confirm dialog names it; confirm to send.
  await page.locator(TID.selectionBarForward).click();
  await expect(page.locator(TID.selectionBar)).toHaveCount(0);
  await expect(page.locator(TID.chatPicker)).toBeVisible();
  await page.locator(TID.chatPickerSearch).fill(groupName);
  await page.locator(TID.chatPickerRowByName(groupName)).first().click();
  await expect(page.locator(TID.chatPicker)).toHaveCount(0);
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(groupName);
  await page.locator(TID.confirmDialogConfirm).click();

  // 5. Already in the target group → all three forwards arrived.
  for (const t of texts) {
    await expect(
      page.locator(
        `[data-testid="message-bubble"][data-direction="outgoing"][data-forwarded="true"]`,
        { hasText: t },
      ),
    ).toBeVisible({ timeout: 30_000 });
  }
});
