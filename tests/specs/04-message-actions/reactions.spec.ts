// Phase 4 — message reactions.
//
// DOM gotcha: `ReactionsRow` is a *sibling* of the `[data-testid=
// "message-bubble"]` div, both nested under an unnamed outer `.row`
// element in `MessageBubble.svelte`. Earlier spec versions used
// `bubble.locator('reactions-row__chip')` (descendant combinator),
// which never matched. Locate the chip page-rooted via the row's
// `data-msg-id` attribute instead.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

type MessageLoadResult =
  | { kind: 'message'; reactions: { reactionsByContact?: Record<number, string[]> } | null }
  | { kind: 'loadingError'; error: string };

async function daemonSelfReactions(
  mainRpc: { call<T>(method: string, params?: unknown[]): Promise<T> },
  accountId: number,
  msgId: number,
): Promise<string[]> {
  const msgs = await mainRpc.call<Record<number, MessageLoadResult>>('get_messages', [accountId, [msgId]]);
  const r = msgs[msgId];
  if (!r || r.kind !== 'message' || !r.reactions) return [];
  // ContactId::SELF = 1.
  return r.reactions.reactionsByContact?.[1] ?? [];
}

async function seedIncomingBubble(
  qxpPaired: { peer: { sendTo: (s: string) => Promise<number>; displayName: string } },
  page: import('@playwright/test').Page,
  text: string,
) {
  await qxpPaired.peer.sendTo(text);
  await waitForChatRowByName(page, qxpPaired.peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, qxpPaired.peer.displayName);
  const bubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: text },
  );
  await expect(bubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  const msgIdStr = await bubble.getAttribute('data-msg-id');
  expect(msgIdStr).toBeTruthy();
  return { bubble, msgId: parseInt(msgIdStr!, 10) };
}

test('reaction: direct RPC writes the chip locally (no UI)', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;
  const { msgId } = await seedIncomingBubble(qxpPaired, page, `react-direct ${Date.now()}`);
  const accountId = (await mainRpc.call<number[]>('get_all_account_ids'))[0];

  await mainRpc.call('send_reaction', [accountId, msgId, ['👍']]);

  // Daemon-side proof of the write.
  await expect.poll(() => daemonSelfReactions(mainRpc, accountId, msgId), {
    timeout: 10_000,
  }).toEqual(['👍']);

  // UI: the reactions row for this msgId carries a 👍 chip marked as own.
  const chip = page.locator(TID.reactionsRowChipForMsg(msgId, '👍'));
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await expect(chip).toHaveAttribute('data-mine', 'true');

  // Untoggle by sending an empty reaction set.
  await mainRpc.call('send_reaction', [accountId, msgId, []]);
  await expect(chip).toHaveCount(0, { timeout: 10_000 });
});

test('reaction: context-menu quick-emoji adds the chip via the UI', async ({ qxpPaired, page }) => {
  const { bubble, msgId } = await seedIncomingBubble(qxpPaired, page, `react-ui ${Date.now()}`);

  await bubble.click({ button: 'right' });
  const firstQuick = page.locator('[data-testid="message-context-menu__quick-emoji"]').first();
  await expect(firstQuick).toBeVisible();
  const emoji = (await firstQuick.getAttribute('data-emoji')) ?? '';
  expect(emoji).not.toBe('');
  await firstQuick.click();

  const chip = page.locator(TID.reactionsRowChipForMsg(msgId, emoji));
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await expect(chip).toHaveAttribute('data-mine', 'true');

  // Tap own chip → untoggles.
  await chip.click();
  await expect(chip).toHaveCount(0, { timeout: 10_000 });
});

test('reaction: picking a different emoji supplants the prior one', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;
  const { msgId } = await seedIncomingBubble(qxpPaired, page, `react-replace ${Date.now()}`);
  const accountId = (await mainRpc.call<number[]>('get_all_account_ids'))[0];

  await mainRpc.call('send_reaction', [accountId, msgId, ['👍']]);
  await expect(
    page.locator(TID.reactionsRowChipForMsg(msgId, '👍')),
  ).toBeVisible({ timeout: 10_000 });

  // Replace semantics: sending a different emoji clears the old one.
  await mainRpc.call('send_reaction', [accountId, msgId, ['🎉']]);
  await expect(
    page.locator(TID.reactionsRowChipForMsg(msgId, '👍')),
  ).toHaveCount(0, { timeout: 10_000 });
  await expect(
    page.locator(TID.reactionsRowChipForMsg(msgId, '🎉')),
  ).toBeVisible();
  await expect(
    page.locator(`${TID.reactionsRowForMsg(msgId)} [data-testid="reactions-row__chip"]`),
  ).toHaveCount(1);
});

test('reaction chip on a jumbomoji bubble does not overlap the timestamp', async ({
  qxpPaired,
  page,
}) => {
  const { mainRpc } = qxpPaired;
  // A bare emoji message renders as jumbomoji (no bubble chrome).
  const { msgId } = await seedIncomingBubble(qxpPaired, page, '🎉');
  const accountId = (await mainRpc.call<number[]>('get_all_account_ids'))[0];
  await mainRpc.call('send_reaction', [accountId, msgId, ['👍']]);

  const chip = page.locator(TID.reactionsRowChipForMsg(msgId, '👍'));
  await expect(chip).toBeVisible({ timeout: 10_000 });

  const meta = page.locator(
    `[data-testid="message-bubble"][data-msg-id="${msgId}"] [data-testid="message-bubble__meta"]`,
  );
  const metaBox = await meta.boundingBox();
  const chipBox = await chip.boundingBox();
  expect(metaBox).not.toBeNull();
  expect(chipBox).not.toBeNull();
  // Chip must sit fully below the meta band — no vertical overlap.
  expect(chipBox!.y).toBeGreaterThanOrEqual(metaBox!.y + metaBox!.height);
});
