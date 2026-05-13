// Phase 4 — delete-for-me.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test('delete-for-me removes the targeted bubble locally', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  const text = 'delete me locally';
  await peer.sendTo(text);
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  const bubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: text },
  );
  await expect(bubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  await bubble.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('delete')).click();
  await expect(page.locator(TID.deleteMsgDialog)).toBeVisible();
  await expect(page.locator(TID.deleteMsgDialogForAll)).toHaveCount(0);
  await page.locator(TID.deleteMsgDialogForMe).click();

  await expect(bubble).toHaveCount(0);
});
