// Phase 3 — day-marker date dividers (T046 / CHAT-002).
//
// `ChatView` inserts a divider row (`dayMarker`) before the first message of
// each calendar day — the run's first message always gets one ("Today"), and
// subsequent days get their own. This asserts the divider renders above the
// conversation with the expected "Today" label.

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName, sendComposerText } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('a day-divider row appears above the day\'s messages', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await openChatByName(page, peer.displayName);

  await sendComposerText(page, `day marker ${Date.now()}`);

  // Today's message gets its own "Today" divider. The template also ships
  // prior-day messages, which carry their own dated divider — so there are
  // multiple dividers, one per calendar day (not a single static header).
  await expect(
    page.locator(TID.chatDayMarker).filter({ hasText: 'Today' }),
  ).toBeVisible({ timeout: 10_000 });
  expect(await page.locator(TID.chatDayMarker).count()).toBeGreaterThanOrEqual(2);
});
