// Phase 12 — drafts: cleared when the message is sent.
//
// After `sendText` resolves, the composer sets `text = ''` which
// triggers the keystroke effect to remove the localStorage entry.
// A subsequent chat-switch round-trip must NOT re-hydrate stale text.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  createGroupChat,
  openChatByName,
  sendComposerText,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('sending the message clears the persisted draft', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const groupName = `Drafts ${Date.now()}`;
  const text = `send-me ${Date.now()}`;

  // Need a second chat to switch into.
  await createGroupChat(page, peer.displayName, groupName);

  // Type + send in peer's chat.
  await openChatByName(page, peer.displayName);
  await sendComposerText(page, text);

  // Composer is empty right after send.
  await expect(page.locator(TID.composerTextarea)).toHaveValue('');

  // Switch away and back — draft must still be empty (no stale value).
  await openChatByName(page, groupName);
  await openChatByName(page, peer.displayName);
  await expect(page.locator(TID.composerTextarea)).toHaveValue('');
});
