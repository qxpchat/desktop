// Shared "jump to message" helper. Used by global search, the in-chat
// media browser, and the chat view's own quote-tap handler — all of which
// need to flash a bubble and scroll it into view, optionally after
// switching chats or returning from a fullscreen route.

import { selectChat } from './selection.svelte';
import { backToChat } from './mainRoute.svelte';
import { flashMessage } from './chat.svelte';

export type JumpOptions = {
  /** Switch to this chat before jumping. Omit when the caller knows the
   *  target is already in the current chat. */
  chatId?: number;
  /** Exit fullscreen routes (settings, QR, media browser, …) so the chat
   *  view is rendered. */
  returnToChat?: boolean;
};

/** Flash + scroll the target bubble into view. The chat view may need to
 *  mount and load its initial message window first, so we poll for the
 *  rendered element for up to ~1.5s before giving up. */
export function jumpToMessage(msgId: number, opts: JumpOptions = {}): void {
  if (opts.chatId != null) selectChat(opts.chatId);
  if (opts.returnToChat) backToChat();
  let attempts = 0;
  const maxAttempts = 30; // ~1.5s at 50 ms intervals
  const tryScroll = () => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      flashMessage(msgId);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (attempts++ < maxAttempts) {
      setTimeout(tryScroll, 50);
    }
  };
  // First attempt deferred so the route/selection change has a tick to apply.
  setTimeout(tryScroll, 60);
}
