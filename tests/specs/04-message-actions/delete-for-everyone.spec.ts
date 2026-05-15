// Phase 4 — delete-for-everyone (recall).
//
// The whole point of recall is that the message vanishes from the *peer's*
// side too. Asserting only "main no longer shows it" would pass on a
// degenerate implementation that just calls `delete_msg` locally — so we
// also poll peer's mailbox until the recall message has been processed
// and the corresponding text no longer appears in peer's chat history.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  sendComposerText,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS, DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(180_000);

test('delete-for-everyone removes the bubble on main AND on peer', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await peer.sendTo('hi');
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  const text = `recall this ${Date.now()}`;
  await sendComposerText(page, text);

  const outgoing = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"]`,
    { hasText: text },
  );
  await expect(outgoing).toBeVisible({ timeout: 10_000 });
  await expect(outgoing).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });

  // Wait for peer to receive the message in the first place — otherwise
  // we'd race the recall against the original delivery and might assert
  // "absent" before it ever arrived.
  type MessageLoadResult =
    | { kind: 'message'; text: string | null }
    | { kind: 'loadingError'; error: string };
  const peerSeesOriginal = async () => {
    const ids = await peer.rpc.call<number[]>('get_message_ids', [
      peer.accountId, peer.pairedChatId, false, false,
    ]);
    if (ids.length === 0) return false;
    const msgs = await peer.rpc.call<Record<number, MessageLoadResult>>(
      'get_messages', [peer.accountId, ids],
    );
    return Object.values(msgs).some((m) => m.kind === 'message' && (m.text ?? '').includes(text));
  };
  const deadline1 = Date.now() + ARRIVAL_TIMEOUT_MS;
  while (Date.now() < deadline1) {
    if (await peerSeesOriginal()) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(await peerSeesOriginal()).toBe(true);

  // Now recall.
  await outgoing.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('delete')).click();
  await expect(page.locator(TID.deleteMsgDialog)).toBeVisible();
  await expect(page.locator(TID.deleteMsgDialogForAll)).toBeVisible();
  await page.locator(TID.deleteMsgDialogForAll).click();

  // Local removal.
  await expect(outgoing).toHaveCount(0);

  // Remote removal: poll until peer's chat no longer contains the text.
  // The recall message is its own SMTP round-trip, allow it the full
  // arrival budget.
  const deadline2 = Date.now() + 90_000;
  while (Date.now() < deadline2) {
    if (!(await peerSeesOriginal())) return;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error('delete-for-everyone did not remove the message on peer within 90s');
});
