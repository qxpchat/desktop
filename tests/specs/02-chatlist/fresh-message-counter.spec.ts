// Phase 2 — chat-row unread badge reflects exact fresh-message count
// (T034 / CHATLIST-005).
//
// `ChatListRow.svelte` renders a `Badge` with `count={chat.freshMessageCounter}`
// when the row is not selected. The earlier `mark-unread` spec only
// covers the single-message case; this one drives the counter through
// several values to lock in that the badge tracks the daemon's
// `fresh_message_counter` exactly, not just "non-zero → visible".

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test('chat row badge reflects fresh-message count exactly', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  const row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer.displayName}"]`,
  );
  await expect(row).toBeVisible();
  // Baseline: paired template starts with no unread on the paired chat.
  await expect(row.locator(TID.chatListRowUnread)).toHaveCount(0);

  // Send three; badge must climb to exactly 3 — not 1, not 2, not
  // "non-zero". The first message is the arrival signal (badge appears);
  // the count assertion that follows is what locks in CHATLIST-005.
  await peer.sendTo(`first ${Date.now()}`);
  await peer.sendTo(`second ${Date.now()}`);
  await peer.sendTo(`third ${Date.now()}`);
  await expect(row.locator(TID.chatListRowUnread)).toBeVisible({
    timeout: ARRIVAL_TIMEOUT_MS,
  });
  await expect(row.locator(TID.chatListRowUnread)).toHaveText('3', {
    timeout: ARRIVAL_TIMEOUT_MS,
  });

  // One more bumps the count to 4 — proves the badge isn't capped or
  // stuck on the first ChatlistItemChanged round-trip.
  await peer.sendTo(`fourth ${Date.now()}`);
  await expect(row.locator(TID.chatListRowUnread)).toHaveText('4', {
    timeout: ARRIVAL_TIMEOUT_MS,
  });

  // Open the chat — ChatView's `markNoticed` clears the counter; the
  // badge must disappear (not just dim). Same path mark-unread.spec.ts
  // already exercises, repeated here only to confirm the *count*
  // transition lands at 0 (vs. some stuck intermediate value).
  await row.click();
  await expect(row.locator(TID.chatListRowUnread)).toHaveCount(0, {
    timeout: ARRIVAL_TIMEOUT_MS,
  });
});
