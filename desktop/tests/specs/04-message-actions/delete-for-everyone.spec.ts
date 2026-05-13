// Phase 4 — delete-for-everyone (recall).

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  sendComposerText,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS, DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test('delete-for-everyone removes the bubble on main', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await peer.sendTo('hi');
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  const text = 'recall this please';
  await sendComposerText(page, text);

  const outgoing = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"]`,
    { hasText: text },
  );
  await expect(outgoing).toBeVisible({ timeout: 10_000 });
  await expect(outgoing).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });

  await outgoing.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('delete')).click();
  await expect(page.locator(TID.deleteMsgDialog)).toBeVisible();
  await expect(page.locator(TID.deleteMsgDialogForAll)).toBeVisible();
  await page.locator(TID.deleteMsgDialogForAll).click();

  await expect(outgoing).toHaveCount(0);
});
