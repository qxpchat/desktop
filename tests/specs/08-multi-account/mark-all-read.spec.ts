// Phase 8 — mark all of an account's chats as read (T010 / ACCT-009).
//
// Right-click a profile tile → "Mark all as read" → calls dc-core's
// `marknoticed_all_chats(accountId)`. Every fresh message in that
// account's chats is marked noticed, freshCount drops to 0, badge clears
// in the rail. Test drives the action while the *other* account is
// selected so we hit the off-screen / inactive path (the common case
// that motivates the feature).

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(180_000);

async function provisionSecondAccount(
  rpc: { call<T>(method: string, params?: unknown[]): Promise<T> },
  displayName: string,
): Promise<number> {
  const prevSelected = await rpc.call<number | null>('get_selected_account_id');
  const id = await rpc.call<number>('add_account');
  await rpc.call('set_config', [id, 'displayname', displayName]);
  await rpc.call('set_config_from_qr', [id, 'dcaccount:nine.testrun.org']);
  await rpc.call('configure', [id]);
  // Start IO *only* on the new account. Earlier we called
  // `start_io_for_all_accounts` here, which restarts existing
  // accounts' IDLE and was responsible for the cold-IDLE race that
  // made the badge assertion downstream flaky — A's IDLE got bumped
  // off the relay just as the peer was about to send. Touch only the
  // new account; A's IDLE keeps its already-stable connection.
  await rpc.call('start_io', [id]);
  if (prevSelected != null) await rpc.call('select_account', [prevSelected]);
  return id;
}

test('mark all account chats as read clears the rail badge', async ({ qxpPaired, page }) => {
  const { peer, mainRpc } = qxpPaired;

  const firstId = await mainRpc.call<number>('get_selected_account_id') as number;
  const secondId = await provisionSecondAccount(mainRpc, 'Second');

  // The templated account A ships with a leftover unread on the device
  // chat. Without clearing, `freshCount > 0` at the start and the
  // baseline assertion below (`toHaveCount(0)`) fails. `marknoticed_chat`
  // on every chat in A's chatlist drives freshCount to 0 across the
  // board, including the device chat that `get_fresh_msgs` silently
  // skips (so `markseen_msgs` alone wouldn't be enough).
  const aChatIds = await mainRpc.call<number[]>('get_chatlist_entries', [firstId, null, null, null]);
  for (const id of aChatIds) await mainRpc.call('marknoticed_chat', [firstId, id]);

  await page.locator(TID.chatListBurger).click();
  await expect(page.locator(TID.navTabsAccount)).toHaveCount(2, { timeout: 10_000 });

  // Wait for selection to settle on A before switching. Provisioning B fires
  // a burst of account events; if we click B while the UI optimistically
  // still shows B selected (stale add_account auto-select), `selectAccount`
  // early-returns without issuing `select_account(B)`, the daemon stays on A,
  // and a later refresh reverts the tile back to A mid-test.
  await expect(page.locator(TID.navTabsAccountById(firstId)))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });

  // Switch to the second account so the first one is inactive — its
  // freshCount will appear as a corner badge when the peer sends in.
  // Assert both the tile and the daemon's selected account flipped (the
  // daemon check catches the early-return race above).
  await page.locator(TID.navTabsAccountById(secondId)).click();
  await expect(page.locator(TID.navTabsAccountById(secondId)))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
  await expect
    .poll(async () => await mainRpc.call<number>('get_selected_account_id'), {
      timeout: 10_000,
    })
    .toBe(secondId);
  await expect(page.locator(TID.navTabsAccountBadgeById(firstId))).toHaveCount(0);

  // Wait for *both* sides to actually be CONNECTED (dc-core: 4000)
  // before the peer sends. dc-core's connectivity enum:
  //   1000 NOT_CONNECTED · 2000 CONNECTING · 3000 WORKING · 4000 CONNECTED
  //
  // Two cold-start races to defeat:
  //   1. Main account A's IMAP IDLE — only enters IDLE at CONNECTED.
  //      A server-side `NOTIFY` arriving before IDLE entry is missed.
  //   2. Peer account's *SMTP* — `peer.sendTo` enqueues a message
  //      synchronously, but actual submission runs on the peer
  //      daemon's IO loop; if the SMTP connection isn't open, mail
  //      sits in the outbox and never reaches A's mailbox.
  //
  // WORKING (3000) is not enough — it means IMAP is *fetching* (e.g.
  // initial inbox sync); IDLE only follows on the CONNECTED edge.
  await expect.poll(
    async () => await mainRpc.call<number>('get_connectivity', [firstId]),
    { timeout: 60_000 },
  ).toBeGreaterThanOrEqual(4000);
  await expect.poll(
    async () => await peer.rpc.call<number>('get_connectivity', [peer.accountId]),
    { timeout: 60_000 },
  ).toBeGreaterThanOrEqual(4000);

  // Peer sends to the first account → badge lights up on its tile.
  await peer.sendTo('unread one');
  const lastMsgId = await peer.sendTo('unread two');

  // Wait for peer's outbox to actually flush — `misc_send_text_message`
  // returns the new msg id synchronously but submission runs on the
  // SMTP IO loop afterwards. dc-core MessageState: 20 OutPending,
  // 24 OutFailed, 26 OutDelivered, 28 OutMdnRcvd. Anything ≥26 means
  // the relay accepted the mail, which is the precondition for A's
  // IMAP IDLE to fire.
  await expect.poll(
    async () => {
      const m = await peer.rpc.call<{ state: number }>('get_message', [peer.accountId, lastMsgId]);
      return m.state;
    },
    { timeout: 60_000 },
  ).toBeGreaterThanOrEqual(26);

  // Diagnostic: selection should still be on secondId after all the
  // peer-side waits. If aria-pressed has reverted to firstId, the
  // badge can't render there regardless of freshCount — same root
  // cause as the original "click eaten by preventDefault" regression.
  await expect(page.locator(TID.navTabsAccountById(secondId)))
    .toHaveAttribute('aria-pressed', 'true');

  // Now poll the main side. Nudges `maybe_network` every 2 s in case
  // the server-side NOTIFY didn't wake A's IDLE.
  const deadline = Date.now() + ARRIVAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const count = await page.locator(TID.navTabsAccountBadgeById(firstId)).count();
    if (count > 0) break;
    await mainRpc.call('maybe_network');
    await page.waitForTimeout(2_000);
  }
  // Final sanity-check assert. The poll loop above already broke once
  // the badge mounted; this just produces a proper Playwright failure
  // message if the relay handshake ran out the full ARRIVAL_TIMEOUT_MS
  // before the badge appeared.
  await expect(page.locator(TID.navTabsAccountBadgeById(firstId)))
    .toBeVisible();

  // Right-click → Mark all as read.
  await page.locator(TID.navTabsAccountById(firstId)).click({ button: 'right' });
  await page.locator(TID.navTabsAccountMenuMarkRead).click();

  // Badge clears once `MsgsNoticed` events propagate through to
  // `profiles.svelte.ts → patchFresh`.
  await expect(page.locator(TID.navTabsAccountBadgeById(firstId)))
    .toHaveCount(0, { timeout: 10_000 });
});
