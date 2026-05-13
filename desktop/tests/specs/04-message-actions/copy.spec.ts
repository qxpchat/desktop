// Phase 4 — copy message text to the clipboard.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4040',
  });
});

test('copy puts the message body on the clipboard', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  const text = 'verbatim text to copy';
  await peer.sendTo(text);
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  const bubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: text },
  );
  await expect(bubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  await bubble.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('copy')).click();

  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(text);
});
