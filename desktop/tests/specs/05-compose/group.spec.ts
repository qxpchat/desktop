// Phase 5 — group creation.
//
// Compose → New Group → pick peer as member → Next → name the group →
// Create. Test ends in the new group chat (topbar shows the name) and
// the first message sent into it lands as an outgoing bubble. The peer
// is the sole member besides self.
//
// We don't test avatar upload here — it's a Phase 7 concern in the
// plan; this spec just covers the *creation* path.

import { test, expect } from '../../fixtures/app-paired.js';
import { sendComposerText } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test('compose → New Group → pick member → name → first message sends', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const groupName = `Project ${Date.now()}`;

  await page.locator(TID.composeButton).click();
  await expect(page.locator(TID.composePane)).toBeVisible();
  await page.locator(TID.composePaneNewGroup).click();

  // Member picker — pick peer + go to metadata.
  await expect(page.locator(TID.chooseMembers)).toHaveAttribute('data-flow', 'group');
  await page.locator(TID.contactRowByName(peer.displayName)).first().click();
  await page.locator(TID.chooseMembersNext).click();

  // Metadata — set name + create.
  await expect(page.locator(TID.groupMetadata)).toBeVisible();
  await page.locator(TID.groupMetadataName).fill(groupName);
  await page.locator(TID.groupMetadataCreate).click();

  // Lands in the new group chat.
  await expect(page.locator(TID.chatTopbarTitle)).toHaveText(groupName);

  // Verify the chat is actually a Group (not e.g. accidentally created
  // as a 1:1 or broadcast). Read the chat type back through the daemon.
  const { mainRpc } = qxpPaired;
  const accountId = (await mainRpc.call<number[]>('get_all_account_ids'))[0];
  const entries = await mainRpc.call<number[]>('get_chatlist_entries', [accountId, null, groupName, null]);
  expect(entries.length).toBeGreaterThan(0);
  const info = await mainRpc.call<{ chatType: string; name: string }>('get_basic_chat_info', [accountId, entries[0]]);
  expect(info.chatType).toBe('Group');
  expect(info.name).toBe(groupName);

  // First message round-trips delivered.
  const text = 'kickoff';
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
