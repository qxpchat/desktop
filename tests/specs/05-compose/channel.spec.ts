// Phase 5 — channel (broadcast) creation.
//
// Backed by `create_broadcast` rather than `create_group_chat`. Unlike
// groups, channels have NO member picker: broadcast recipients can only
// join via QR/securejoin (core rejects add_contact_to_chat on an
// OutBroadcast). New Channel therefore goes straight to the name step.
// We verify the chat is created as an OutBroadcast and the first
// outgoing message lands.

import { test, expect } from '../../fixtures/app-paired.js';
import { sendComposerText } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test('compose → New Channel → name → first message sends', async ({ qxpPaired, page }) => {
  const channelName = `Updates ${Date.now()}`;

  await page.locator(TID.composeButton).click();
  await expect(page.locator(TID.composePane)).toBeVisible();
  await page.locator(TID.composePaneNewChannel).click();

  // New Channel skips the member picker — straight to the name step.
  await expect(page.locator(TID.chooseMembers)).toHaveCount(0);
  await expect(page.locator(TID.groupMetadata)).toHaveAttribute('data-flow', 'channel');
  await page.locator(TID.groupMetadataName).fill(channelName);
  await page.locator(TID.groupMetadataCreate).click();

  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(channelName);

  // Verify the chat is actually a broadcast (not a Group). The two flows
  // share most of their UI; without this check both could accidentally
  // call create_group_chat and the topbar title alone wouldn't reveal it.
  const { mainRpc } = qxpPaired;
  const accountId = (await mainRpc.call<number[]>('get_all_account_ids'))[0];
  const entries = await mainRpc.call<number[]>('get_chatlist_entries', [accountId, null, channelName, null]);
  expect(entries.length).toBeGreaterThan(0);
  const info = await mainRpc.call<{ chatType: string; name: string }>('get_basic_chat_info', [accountId, entries[0]]);
  expect(info.chatType).toBe('OutBroadcast');
  expect(info.name).toBe(channelName);

  const text = 'first broadcast';
  await sendComposerText(page, text);
  const outgoing = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"]`,
    { hasText: text },
  );
  await expect(outgoing).toBeVisible({ timeout: 10_000 });
  await expect(outgoing).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });
});
