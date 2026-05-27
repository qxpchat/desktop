// Phase 2 — chat-row delivery-status glyph reflects the latest outgoing
// summary state (T035 / CHATLIST-006).
//
// `ChatListRow.svelte` derives `stateGlyph` from `chat.summaryStatus` and
// renders an Icon in `[data-testid="chat-list-row__state"]` with the
// kind exposed via `data-state` (`pending` | `delivered` | `read` |
// `failed`). The bubble-side suite already covers the per-message glyph;
// this spec is the row-side equivalent — it locks in that the chatlist
// item summary tracks the outgoing send through `delivered` → `read`.
//
// Failure / pending states are not asserted: `failed` requires breaking
// SMTP at runtime (no fixture), and `pending` resolves so quickly after
// `sendText` returns that it's racy in CI — the bubble suite skips them
// for the same reason.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  openChatByName,
  sendComposerText,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(300_000);

test('chat row state glyph walks delivered → read for latest outgoing summary', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;

  await openChatByName(page, peer.displayName);

  const row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer.displayName}"]`,
  );
  await expect(row).toBeVisible();

  const outgoing = `row-state ping ${Date.now()}`;
  await sendComposerText(page, outgoing);

  const rowState = row.locator(TID.chatListRowState);
  await expect(rowState).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });

  // Drive MDN from peer to flip the summary to read. Retry loop here
  // (instead of helpers/setup.ts `waitForOutgoingRead`) because that
  // helper polls a bubble locator's `data-state` — we want the row
  // locator's attribute, observable from the chat list pane.
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await peer.markSeen(5_000);
    const state = await rowState.getAttribute('data-state');
    if (state === 'read') break;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  await expect(rowState).toHaveAttribute('data-state', 'read');
});
