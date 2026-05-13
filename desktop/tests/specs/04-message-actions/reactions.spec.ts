// Phase 4 — message reactions.
//
// Reactions are local-first: dc-core's `send_reaction` writes to the
// `msgs_reactions` table and emits `ReactionsChanged` synchronously
// before the MIME goes out. So even if chatmail's `filtermail` were to
// reject the hidden reaction message over the wire, the sender's own
// chip must still appear locally.
//
// qxp's `toggleReaction` (chat.svelte.ts:564) implements one-emoji-per-
// user-per-message semantics (matches Signal / WhatsApp): tapping a new
// emoji *replaces* the prior one rather than stacking, and tapping your
// own chip clears it. Two tests cover these two transitions.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

async function seedIncoming(qxpPaired: { peer: { sendTo: (s: string) => Promise<number>; displayName: string } }, page: import('@playwright/test').Page, text: string) {
  await qxpPaired.peer.sendTo(text);
  await waitForChatRowByName(page, qxpPaired.peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, qxpPaired.peer.displayName);
  const bubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: text },
  );
  await expect(bubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  return bubble;
}

test('reaction toggle: own chip appears on pick and disappears on re-tap', async ({ qxpPaired, page }) => {
  const bubble = await seedIncoming(qxpPaired, page, `react-toggle ${Date.now()}`);

  await bubble.click({ button: 'right' });
  const firstQuick = page.locator('[data-testid="message-context-menu__quick-emoji"]').first();
  await expect(firstQuick).toBeVisible();
  const emoji = (await firstQuick.getAttribute('data-emoji')) ?? '';
  expect(emoji).not.toBe('');
  await firstQuick.click();

  const chip = bubble.locator(`[data-testid="reactions-row__chip"][data-emoji="${emoji}"]`);
  // Local DB write + ReactionsChanged event + patchMessage refresh — all
  // synchronous on dc-core's side. Network not on the critical path.
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await expect(chip).toHaveAttribute('data-mine', 'true');

  // Tap own chip → clears it (toggleReaction sends `[]`).
  await chip.click();
  await expect(chip).toHaveCount(0, { timeout: 10_000 });
});

test('reaction replace: picking a different emoji supplants the prior one', async ({ qxpPaired, page }) => {
  const bubble = await seedIncoming(qxpPaired, page, `react-replace ${Date.now()}`);

  await bubble.click({ button: 'right' });
  const firstQuick = page.locator('[data-testid="message-context-menu__quick-emoji"]').first();
  const emojiA = (await firstQuick.getAttribute('data-emoji')) ?? '';
  await firstQuick.click();
  const chipA = bubble.locator(`[data-testid="reactions-row__chip"][data-emoji="${emojiA}"]`);
  await expect(chipA).toBeVisible({ timeout: 10_000 });

  await bubble.click({ button: 'right' });
  const secondQuick = page.locator('[data-testid="message-context-menu__quick-emoji"]').nth(1);
  const emojiB = (await secondQuick.getAttribute('data-emoji')) ?? '';
  expect(emojiB).not.toBe(emojiA);
  await secondQuick.click();

  // After replace: chip A is gone, chip B is the only chip.
  await expect(chipA).toHaveCount(0, { timeout: 10_000 });
  const allChips = bubble.locator(`[data-testid="reactions-row__chip"]`);
  await expect(allChips).toHaveCount(1);
  await expect(allChips.first()).toHaveAttribute('data-emoji', emojiB);
  await expect(allChips.first()).toHaveAttribute('data-mine', 'true');
});
