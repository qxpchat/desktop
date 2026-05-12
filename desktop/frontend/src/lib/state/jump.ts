// Universal "jump to a specific message" helper.
//
// Callers: global message search, in-chat quote tap, in-chat media-browser
// hits, anywhere a `(chatId?, msgId)` tuple needs to land the user on a
// specific bubble.
//
// Split of concerns:
//   - This function handles the *navigation*: drop fullscreen routes,
//     switch chat, wait for the initial load, and paginate the loaded
//     window backwards until the target is in `chat.ids`.
//   - ChatView handles the *scroll*: a dedicated `$effect` watches
//     `chat.jumpTargetId` and `chat.ids`. When the target lands in
//     `chat.ids`, it flashes + scrollIntoView from inside the same
//     render cycle that mounted the bubble. That co-location is what
//     keeps the bottom-pin loop and the fly-in transition from
//     swallowing the scroll.
//
// `chat.jumpTargetId` is set here and cleared by ChatView once the scroll
// lands. On the failure paths below, we clear it ourselves so a doomed
// jump doesn't leave the auto-scroll-to-bottom suppressed indefinitely.

import { selectChat } from './selection.svelte';
import { backToChat } from './mainRoute.svelte';
import { chat, loadUntilInWindow } from './chat.svelte';

export type JumpOptions = {
  /** Switch to this chat before jumping. Omit when the target is already
   *  in the current chat (e.g. quote tap inside a bubble). */
  chatId?: number;
  /** Exit fullscreen routes (settings, QR, media browser, …) so the chat
   *  view is rendered. */
  returnToChat?: boolean;
};

/** Poll-wait until `chat.active.chatId` matches `chatId` and the initial
 *  window has populated. Bounded so a stuck load doesn't pin the jump. */
async function waitForChatLoaded(chatId: number, timeoutMs = 3000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (chat.active?.chatId === chatId && !chat.loading && chat.allIds.length > 0) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  return false;
}

/** Switch chat, paginate the loaded window back to the target, and let
 *  ChatView's jump-target effect handle the flash + scroll. */
export async function jumpToMessage(msgId: number, opts: JumpOptions = {}): Promise<void> {
  chat.jumpTargetId = msgId;
  try {
    if (opts.returnToChat) backToChat();

    if (opts.chatId != null && opts.chatId !== chat.active?.chatId) {
      selectChat(opts.chatId);
      const ok = await waitForChatLoaded(opts.chatId);
      if (!ok) {
        chat.jumpTargetId = null;
        return;
      }
    } else if (chat.active == null) {
      chat.jumpTargetId = null;
      return;
    }

    const inWindow = await loadUntilInWindow(msgId);
    if (!inWindow) chat.jumpTargetId = null;
    // On success, ChatView's effect clears the flag after scrolling.
  } catch (err) {
    chat.jumpTargetId = null;
    throw err;
  }
}
