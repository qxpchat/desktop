// Phase 2 — "recently seen" avatar dot on a chat row (T038 / CHATLIST-008.1).
//
// `ChatListRow.svelte` passes `seenRecently={chat.wasSeenRecently}` to
// `Avatar.svelte`, which overlays a green presence dot when dc-core's
// `was_seen_recently()` is true for the chat's contact. A contact is
// "seen recently" once a message from them has arrived in the last ~10
// min — so a fresh inbound message lights the dot on that row.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test('chat row shows the recently-seen presence dot after a message arrives', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;

  const row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer.displayName}"]`,
  );
  await expect(row).toBeVisible();

  // A fresh inbound message updates the contact's last-seen → the row's
  // avatar gains the presence dot.
  await peer.sendTo(`seen ${Date.now()}`);
  await expect(row.locator(TID.avatarPresence)).toBeVisible({
    timeout: ARRIVAL_TIMEOUT_MS,
  });
});
