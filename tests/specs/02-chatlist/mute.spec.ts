// Phase 2 — mute / unmute.
//
// Right-click → Mute → "For 1 hour". The row picks up a bell-off badge
// (chat-list-row__mute). Unmuting drops it again.

import { test, expect } from '../../fixtures/app-paired.js';
import { waitForChatRowByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(60_000);

test('mute toggles the mute badge on the chat row', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await peer.sendTo('ping');
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);

  const row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer.displayName}"]`,
  );
  await expect(row.locator(TID.chatListRowMute)).toHaveCount(0);

  // Mute → duration submenu → 1 hour.
  await row.click({ button: 'right' });
  await page.locator(TID.chatRowMenuItem('mute')).click();
  // Duration list — pick the first option ("For 1 hour").
  await page.locator(TID.chatRowMuteOption).first().click();

  await expect(row.locator(TID.chatListRowMute)).toBeVisible();

  // Unmute → badge gone.
  await row.click({ button: 'right' });
  await page.locator(TID.chatRowMenuItem('unmute')).click();
  await expect(row.locator(TID.chatListRowMute)).toHaveCount(0);
});
