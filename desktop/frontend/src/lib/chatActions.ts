import type { ChatListItem } from './state/chatlist.svelte';

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
