// Global "currently-selected chat" — single source of truth. App-shell
// components and deeply-nested cells (VcardCell, search results, etc.) read
// from / write to this state instead of prop-drilling a callback chain.

import { untrack } from 'svelte';
import { mainRoute } from './mainRoute.svelte';

export const selection = $state<{ chatId: number | null }>({ chatId: null });

export function selectChat(id: number | null): void {
  selection.chatId = id;
  // Switching chats from anywhere — chat list click, forward-picker result,
  // search-jump-to-message, push notification — should always land you in
  // the chat view itself. Otherwise the user is stuck looking at the prior
  // chat's info / QR / media-browser when they click a different chat
  // in the list. Settings + onboarding aren't bound to a chat, so we leave
  // those routes alone.
  //
  // `untrack` is load-bearing: App.svelte has an `$effect` that calls
  // `selectChat(null)` on account change. Without untracking the read
  // here, that effect would acquire `mainRoute` as a tracked dep, and
  // every subsequent route change (opening Settings, ChatInfo, QrShow…)
  // would re-fire it — clearing `selection.chatId` to null in the
  // process and stranding the user on the empty-chat placeholder.
  untrack(() => {
    const k = mainRoute.route.kind;
    if (k === 'chatInfo' || k === 'mediaBrowser' || k === 'qrShow') {
      mainRoute.route = { kind: 'chat' };
    }
  });
}
