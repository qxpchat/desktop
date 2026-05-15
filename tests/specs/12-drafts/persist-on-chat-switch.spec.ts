// Phase 12 — drafts: persist across chat switches.
//
// The Composer stores its body in localStorage keyed by `accountId:chatId`
// on every keystroke. When the user switches chats the previous chat's
// draft is saved and the new chat's draft is hydrated; switching back
// restores the original text.
//
// Two chats are required to exercise the switch — peer's pre-paired
// chat (chat A) plus a freshly-created group (chat B). The group also
// doubles as the per-chat-isolation check: the draft typed in A must
// not appear in B's composer.

import { test, expect } from '../../fixtures/app-paired.js';
import { createGroupChat, openChatByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('draft text is preserved when switching to another chat and back', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const groupName = `Drafts ${Date.now()}`;
  const draftA = `draft for ${peer.displayName} ${Date.now()}`;

  // Create chat B (a group) first — lands the user in B's chat view.
  await createGroupChat(page, peer.displayName, groupName);
  // B's composer starts empty.
  await expect(page.locator(TID.composerTextarea)).toHaveValue('');

  // Switch to chat A (peer) and type a draft.
  await openChatByName(page, peer.displayName);
  await page.locator(TID.composerTextarea).fill(draftA);

  // Switch to B → composer is empty (B has no draft).
  await openChatByName(page, groupName);
  await expect(page.locator(TID.composerTextarea)).toHaveValue('');

  // Switch back to A → original draft is restored verbatim.
  await openChatByName(page, peer.displayName);
  await expect(page.locator(TID.composerTextarea)).toHaveValue(draftA);
});
