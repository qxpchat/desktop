// Global "currently-selected chat" — single source of truth. App-shell
// components and deeply-nested cells (VcardCell, search results, etc.) read
// from / write to this state instead of prop-drilling a callback chain.

import { untrack } from 'svelte';
import { mainRoute } from './mainRoute.svelte';
import { pinChatItem } from './chatlist.svelte';

export const selection = $state<{ chatId: number | null }>({ chatId: null });

// A cross-account jump target. App.svelte's account-change effect clears the
// open chat on every account switch (chat ids are per-account), so a
// deliberate jump *into* a chat that lives in a not-yet-active account — a
// notification tap, a deep link — would have its chat wiped the instant the
// account flips. Stashing the target here lets that effect re-apply it after
// the switch instead of clearing. Plain module state (not a rune): the effect
// already re-runs on the `accounts.selectedId` change that accompanies it.
let pendingAccountChat: { accountId: number; chatId: number } | null = null;

/** Record the chat to open once `accountId` becomes active. Pair with a
 *  write to `accounts.selectedId` (after `select_account`); the
 *  account-change effect drains it via `consumePendingChat`. */
export function requestChatInAccount(accountId: number, chatId: number): void {
  pendingAccountChat = { accountId, chatId };
}

/** Pop the pending cross-account chat target if it's for `accountId`.
 *  Returns the chat id to open, else null. */
export function consumePendingChat(accountId: number): number | null {
  if (pendingAccountChat?.accountId === accountId) {
    const id = pendingAccountChat.chatId;
    pendingAccountChat = null;
    return id;
  }
  return null;
}

export function selectChat(id: number | null): void {
  selection.chatId = id;
  // Keep the open chat's payload in `chatlist.items` — the topbar / composer
  // read metadata from there, but a search filter can drop it from the list.
  pinChatItem(id);
  // Switching *to* a chat from anywhere — chat list click, forward-picker
  // result, search-jump-to-message, push notification — should always land
  // you in the chat view itself. Otherwise the user is stuck looking at
  // the prior chat's info / QR / media-browser when they click a different
  // chat in the list. Settings + onboarding aren't bound to a chat, so we
  // leave those routes alone.
  //
  // Skip the flip when `id == null` (clearing selection): App.svelte calls
  // `selectChat(null)` from its account-change effect, and background
  // events (AccountsItemChanged after configure / start_io) can re-fire
  // that effect while the user is on QrShow / ChatInfo / MediaBrowser.
  // Clearing selection there must not yank the user back to the chat
  // view — those views are reachable without an open chat.
  //
  // `untrack` is load-bearing: without it the read of `mainRoute.route.kind`
  // would acquire `mainRoute` as a tracked dep of the calling effect, and
  // every subsequent route change would re-fire it.
  if (id != null) {
    untrack(() => {
      const k = mainRoute.route.kind;
      if (k === 'chatInfo' || k === 'mediaBrowser' || k === 'qrShow') {
        mainRoute.route = { kind: 'chat' };
      }
    });
  }
}
