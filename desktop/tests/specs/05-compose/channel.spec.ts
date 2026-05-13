// Phase 5 — channel (broadcast) creation.
//
// Symmetric to the group spec but via the New Channel button — backed
// by `create_broadcast` rather than `create_group_chat`. Channels are
// one-way: subscribers can read but only the owner sends, so we just
// verify the chat is created with the right name + the first outgoing
// message lands.

import { test, expect } from '../../fixtures/app-paired.js';
import { sendComposerText } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test('compose → New Channel → pick subscriber → name → first message sends', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const channelName = `Updates ${Date.now()}`;

  await page.locator(TID.composeButton).click();
  await expect(page.locator(TID.composePane)).toBeVisible();
  await page.locator(TID.composePaneNewChannel).click();

  await expect(page.locator(TID.chooseMembers)).toHaveAttribute('data-flow', 'channel');
  await page.locator(TID.contactRowByName(peer.displayName)).first().click();
  await page.locator(TID.chooseMembersNext).click();

  await expect(page.locator(TID.groupMetadata)).toHaveAttribute('data-flow', 'channel');
  await page.locator(TID.groupMetadataName).fill(channelName);
  await page.locator(TID.groupMetadataCreate).click();

  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(channelName);

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
