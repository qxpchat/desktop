import type { ChatListItem } from './state/chatlist.svelte';
import { rpc } from './rpc';
import { accounts } from './state/accounts.svelte';
import { selectChat } from './state/selection.svelte';
import { backToChat } from './state/mainRoute.svelte';

// Encrypted groups the user is still a member of (and inbound broadcasts
// they've joined) need a `leave_group` before `delete_chat` — otherwise
// upstream still treats them as a phantom member. Mirrors the
// `canLeaveChat` predicate in deltachat-desktop's ChatContextMenu.
export function canLeaveBeforeDelete(chat: ChatListItem): boolean {
  if (chat.chatType === 'InBroadcast') return chat.isSelfInGroup;
  if (chat.chatType === 'Group') {
    return chat.isEncrypted && chat.isSelfInGroup && !chat.isContactRequest;
  }
  return false;
}

// Ensure there's a 1:1 chat with `email` on the active account and
// navigate to it. `create_contact` is idempotent on (addr, name) — it
// returns the existing contact id if one exists — and
// `create_chat_by_contact_id` does the same for the chat. Used by both
// the vcard preview cell's "Open chat" button and clickable email
// addresses inside message text.
export async function openChatByEmail(email: string): Promise<void> {
  if (accounts.selectedId == null) return;
  const accountId = accounts.selectedId;
  const addr = email.trim();
  if (!addr) return;
  try {
    const contactId = await rpc.call<number>('create_contact', [accountId, addr, '']);
    const chatId = await rpc.call<number>('create_chat_by_contact_id', [accountId, contactId]);
    selectChat(chatId);
  } catch (err) {
    console.warn('openChatByEmail failed', err);
  }
}

// Open (or create) the 1:1 chat for a known contact id, then leave the
// chat-info pane so the new chat is visible. Used by member rows in
// group/broadcast info.
export async function openChatByContactId(contactId: number): Promise<void> {
  if (accounts.selectedId == null) return;
  const accountId = accounts.selectedId;
  try {
    const chatId = await rpc.call<number>('create_chat_by_contact_id', [accountId, contactId]);
    selectChat(chatId);
    backToChat();
  } catch (err) {
    console.warn('openChatByContactId failed', err);
  }
}
