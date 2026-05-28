// Phase 2 — chat-row live-location indicator (T037 / CHATLIST-008).
//
// `ChatListRow.svelte` renders a map-pin glyph next to the chat name when
// a peer is actively streaming live-location to us — driven by
// `liveLocations.chatIds` (state/liveLocations.svelte.ts), which is
// repopulated on every `LocationChanged` event from `get_locations`.
//
// To exercise it the paired peer enables location streaming into its
// 1:1 chat with main, then sets a location point. dc-core ships the
// point to main as a stream message (msgId == 0); main's
// `refreshLiveLocations` picks it up and the row glyph appears.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(300_000);

test('chat row shows the live-location indicator while a peer is streaming', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;

  const row = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer.displayName}"]`,
  );
  await expect(row).toBeVisible();
  // Baseline: nobody is streaming, so no map-pin.
  await expect(row.locator(TID.chatListRowLive)).toHaveCount(0);

  // Peer turns on location streaming into its chat with main, then emits a
  // point. `set_location` is account-less (operates on the peer daemon's
  // single account) and only broadcasts once streaming is enabled.
  await peer.rpc.call('send_locations_to_chat', [peer.accountId, peer.pairedChatId, 600]);
  await peer.rpc.call('set_location', [51.5007, -0.1246, 10]);

  // Stream point round-trips over chatmail; main's LocationChanged handler
  // flips `liveLocations.chatIds` and the row glyph mounts.
  await expect(row.locator(TID.chatListRowLive)).toBeVisible({
    timeout: ARRIVAL_TIMEOUT_MS,
  });
});
