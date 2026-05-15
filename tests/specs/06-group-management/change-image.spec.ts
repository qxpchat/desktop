// Phase 6 — set / change a broadcast channel image.
//
// Same flow as change-avatar but the chat is an OutBroadcast. The
// affordance shares one code path in ChatInfo.svelte; this spec proves
// it works for the channel chat type too.

import { test, expect } from '../../fixtures/app-paired.js';
import { sendComposerText } from '../../helpers/setup.js';
import { ensureFixtures, mediaPath } from '../../helpers/media.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test.beforeAll(() => ensureFixtures());

test('change-image: upload an image becomes the channel profile image', async ({ qxpPaired, page }) => {
  const { peer, mainRpc } = qxpPaired;
  const channelName = `Cover ${Date.now()}`;

  // Create a channel with peer as subscriber.
  await page.locator(TID.composeButton).click();
  await page.locator(TID.composePaneNewChannel).click();
  await page.locator(TID.contactRowByName(peer.displayName)).first().click();
  await page.locator(TID.chooseMembersNext).click();
  await page.locator(TID.groupMetadataName).fill(channelName);
  await page.locator(TID.groupMetadataCreate).click();
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(channelName);

  // Send a tiny seed so the chat is non-empty (some core paths short-
  // circuit profile-image writes on never-sent chats).
  await sendComposerText(page, 'hi');

  // Open chat-info.
  await page.locator(TID.chatTopbarInfo).click();
  await expect(page.locator(TID.chatInfo)).toBeVisible();

  const accountId = (await mainRpc.call<number[]>('get_all_account_ids'))[0];
  const entries = await mainRpc.call<number[]>('get_chatlist_entries', [accountId, null, channelName, null]);
  const chatId = entries[0];

  // Confirm it's actually a broadcast.
  const basic = await mainRpc.call<{ chatType: string }>('get_basic_chat_info', [accountId, chatId]);
  expect(basic.chatType).toBe('OutBroadcast');

  const before = await mainRpc.call<{ profileImage: string | null }>('get_full_chat_by_id', [accountId, chatId]);
  expect(before.profileImage).toBeNull();

  await expect(page.locator(TID.chatInfoAvatarEdit)).toBeVisible();
  await page.locator(TID.chatInfoAvatarFileInput).setInputFiles(mediaPath('test.png'));

  await expect.poll(async () => {
    const c = await mainRpc.call<{ profileImage: string | null }>('get_full_chat_by_id', [accountId, chatId]);
    return c.profileImage;
  }, { timeout: 15_000 }).not.toBeNull();
});
