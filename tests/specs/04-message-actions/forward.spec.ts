// Phase 4 — forward a message into a distinct target chat.
//
// Forwarding into the same chat the message originated from degenerates
// into "duplicate this message" — a degenerate implementation that just
// re-sent the bubble locally would pass. We create a Group as the target
// so the forward actually exercises cross-chat routing.
//
// Production behaviour (ForwardFlow.svelte): picking a target chat
// *opens* that chat, then a ConfirmDialog names it; only on confirm does
// `forward_messages` fire. We verify the forwarded bubble lands in the
// group AND the source 1:1 keeps no local duplicate.

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

  // 3. Forward → pick the group. Picker closes, the group chat opens, and
  //    a confirm dialog names the target.
  await incoming.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('forward')).click();
  await expect(page.locator(TID.chatPicker)).toBeVisible();
  await page.locator(TID.chatPickerSearch).fill(groupName);
  await page.locator(TID.chatPickerRowByName(groupName)).first().click();
  await expect(page.locator(TID.chatPicker)).toHaveCount(0);
  // The target chat is now open — the user sees exactly where it lands.
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(groupName);
  await expect(page.locator(TID.confirmDialogConfirm)).toBeVisible();
  await page.locator(TID.confirmDialogConfirm).click();

  // 4. Forwarded bubble landed in the group (we're already here).
  const forwarded = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-forwarded="true"]`,
    { hasText: original },
  );
  await expect(forwarded).toBeVisible({ timeout: 15_000 });

  // 5. Back in the source 1:1 — exactly one bubble with that text (the
  //    original incoming), no local duplicate.
  await openChatByName(page, peer.displayName);
  const sameTextBubbles = page.locator(
    `[data-testid="message-bubble"]`,
    { hasText: original },
  );
  await expect(sameTextBubbles).toHaveCount(1);
});

// Declining the confirm dialog must send nothing AND drop the user back
// into the chat the message came from (not strand them in the target).
test('forward → cancel sends nothing and returns to the source chat', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  const groupName = `Cancel target ${Date.now()}`;
  await createGroupChat(page, peer.displayName, groupName);

  await openChatByName(page, peer.displayName);
  const original = `cancel-me ${Date.now()}`;
  await peer.sendTo(original);
  const incoming = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: original },
  );
  await expect(incoming).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Forward → pick the group → group opens + confirm dialog → decline.
  await incoming.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('forward')).click();
  await expect(page.locator(TID.chatPicker)).toBeVisible();
  await page.locator(TID.chatPickerSearch).fill(groupName);
  await page.locator(TID.chatPickerRowByName(groupName)).first().click();
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(groupName);
  await page.locator(TID.confirmDialogCancel).click();

  // Back in the source 1:1.
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(peer.displayName);

  // The group received nothing.
  await openChatByName(page, groupName);
  await expect(
    page.locator(
      `[data-testid="message-bubble"][data-forwarded="true"]`,
      { hasText: original },
    ),
  ).toHaveCount(0);
});
