// Phase 4 — forward a message into a distinct target chat.
//
// Forwarding into the same chat the message originated from degenerates
// into "duplicate this message" — a degenerate implementation that just
// re-sent the bubble locally would pass. We create a Group as the target
// so the forward actually exercises cross-chat routing.
//
// Production behaviour (ChatView.onForwardPicked at L468): forwarding
// fires `forward_messages` and stays on the source chat — it does NOT
// navigate to the target. We switch chats manually to verify the
// forwarded bubble landed in the group AND the source chat didn't get
// a local duplicate.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  createGroupChat,
  openChatByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test('forward routes the message into a different chat (group)', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  // 1. Create a distinct destination chat (group with peer) FIRST so it
  //    exists in the chat list. createGroupChat lands us inside the new
  //    group's ChatView.
  const groupName = `Forward target ${Date.now()}`;
  await createGroupChat(page, peer.displayName, groupName);

  // 2. Switch back to the 1:1, seed the original, wait for the bubble.
  //    The peer's chat row already exists from the template handshake;
  //    `openChatByName` works immediately. We need the *message* bubble
  //    to land, which takes an IMAP poll.
  await openChatByName(page, peer.displayName);
  const original = `forward-me ${Date.now()}`;
  await peer.sendTo(original);
  const incoming = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: original },
  );
  await expect(incoming).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // 3. Forward → pick the group. The dialog closes and the UI stays on
  //    the 1:1 (no auto-navigate).
  await incoming.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('forward')).click();
  await expect(page.locator(TID.chatPicker)).toBeVisible();
  await page.locator(TID.chatPickerSearch).fill(groupName);
  await page.locator(TID.chatPickerRowByName(groupName)).first().click();
  await expect(page.locator(TID.chatPicker)).toHaveCount(0);
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(peer.displayName);

  // 4. Source chat must NOT have a duplicate of the forwarded text — the
  //    user is still here, they didn't forward into here.
  const sameTextBubbles = page.locator(
    `[data-testid="message-bubble"]`,
    { hasText: original },
  );
  await expect(sameTextBubbles).toHaveCount(1);

  // 5. Switch to the target group → forwarded bubble landed there.
  await openChatByName(page, groupName);
  const forwarded = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-forwarded="true"]`,
    { hasText: original },
  );
  await expect(forwarded).toBeVisible({ timeout: 15_000 });
});
