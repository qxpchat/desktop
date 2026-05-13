// Phase 4 — forward a message (single destination).

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName, waitForChatRowByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test('forward sends the message into the picked target chat', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  const original = 'forward me please';
  await peer.sendTo(original);
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  const incoming = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: original },
  );
  await expect(incoming).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  await incoming.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('forward')).click();
  await expect(page.locator(TID.chatPicker)).toBeVisible();

  // Use the peer's own chat as the forward target — the template
  // pre-pairs main with peer, so this chat is guaranteed to exist.
  // (Saved Messages isn't auto-created on configure, so it'd be
  // absent from a freshly-templated account.) After forwarding, the
  // peer's chat — already open — gets a new outgoing bubble carrying
  // `data-forwarded="true"`.
  await page.locator(TID.chatPickerSearch).fill(peer.displayName);
  await page.locator(TID.chatPickerRowByName(peer.displayName)).first().click();

  const forwarded = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-forwarded="true"]`,
    { hasText: original },
  );
  await expect(forwarded).toBeVisible({ timeout: 15_000 });
});
