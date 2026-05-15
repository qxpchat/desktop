// Phase 2 — chat list, load & sort.
//
// peer1 and peer2 both seed a chat with main, ~3s apart. The chat list
// should sort by most-recent last-message timestamp → peer2's row first.
//
// Both peers come from the trio template (pre-paired with main), so this
// spec skips the per-test 30-150s live secure_join handshakes entirely.

import { test, expect } from '../../fixtures/app-trio.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test('chat list shows incoming chats sorted newest-first', async ({ qxpTrio, page }) => {
  const { peer1, peer2 } = qxpTrio;

  await peer1.sendTo('hello from peer1');
  const peer1Row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`,
  );
  await expect(peer1Row).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Wallclock gap so peer2's last-message timestamp is strictly newer.
  await new Promise((r) => setTimeout(r, 3_000));
  await peer2.sendTo('hello from peer2');
  const peer2Row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer2.displayName}"]`,
  );
  await expect(peer2Row).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Built-in Saved/Device chats may also live in the list but always with
  // older timestamps — we just assert peer2 sorts above peer1.
  const rows = page.locator(`${TID.chatList} [data-testid="chat-list-row"]`);
  await expect(rows.first()).toHaveAttribute('data-name', peer2.displayName);
  await expect(rows.nth(1)).toHaveAttribute('data-name', peer1.displayName);
});
