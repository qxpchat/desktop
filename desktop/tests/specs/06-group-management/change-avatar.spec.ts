// Phase 6 — set / change a group avatar.
//
// Tap the avatar in chat-info → hidden file input fires → blob uploaded
// → `set_chat_profile_image`. Verify both the UI img src updates AND
// the daemon-side `profileImage` becomes non-null.

import { test, expect } from '../../fixtures/app-paired.js';
import { createGroupAndOpenInfo } from '../../helpers/setup.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test.beforeAll(() => ensureFixtures());

test('change-avatar: upload an image becomes the group profile image', async ({ qxpPaired, page }) => {
  const { peer, mainRpc } = qxpPaired;

  const groupName = `Avatar ${Date.now()}`;
  await createGroupAndOpenInfo(page, peer.displayName, groupName);

  const accountId = (await mainRpc.call<number[]>('get_all_account_ids'))[0];
  const entries = await mainRpc.call<number[]>('get_chatlist_entries', [accountId, null, groupName, null]);
  const chatId = entries[0];

  // Before: no profile image.
  const before = await mainRpc.call<{ profileImage: string | null }>('get_full_chat_by_id', [accountId, chatId]);
  expect(before.profileImage).toBeNull();

  // The hidden input lives next to the avatar-edit button. setInputFiles
  // skips the native file-dialog (which Playwright can't drive in headless
  // Chromium) and feeds straight through the production change handler.
  await expect(page.locator(TID.chatInfoAvatarEdit)).toBeVisible();
  await page.locator(TID.chatInfoAvatarFileInput).setInputFiles(mediaPath('test.png'));

  // After: profileImage is a daemon-side absolute path. Poll because the
  // upload + RPC + reload is async.
  await expect.poll(async () => {
    const c = await mainRpc.call<{ profileImage: string | null }>('get_full_chat_by_id', [accountId, chatId]);
    return c.profileImage;
  }, { timeout: 15_000 }).not.toBeNull();
});
