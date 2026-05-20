// Per-chat metadata state — backs the ChatInfo view (member list, shared
// chats, ephemeral-timer setting, rename, leave, delete, block, avatar).
//
// Why a separate module: ChatInfo.svelte used to do 12 raw `rpc.call`s
// inline plus filter the chatlist wire union via `kind === 'ChatListItem'`
// directly in component code. Lifting those into a state module unwraps
// the wire shape at the boundary, so consumers see clean `Contact[]` /
// `SharedChat[]` without PascalCase discriminator handling.

import { rpc } from '../rpc';

type ChatTypeStr = 'Single' | 'Group' | 'Mailinglist' | 'OutBroadcast' | 'InBroadcast';

export type FullChat = {
  id: number;
  name: string;
  isEncrypted: boolean;
  profileImage: string | null;
  archived: boolean;
  pinned: boolean;
  chatType: ChatTypeStr;
  isSelfTalk: boolean;
  contactIds: number[];
  pastContactIds: number[];
  color: string;
  isMuted: boolean;
  ephemeralTimer: number;
  selfInGroup: boolean;
};

export type Contact = {
  id: number;
  address: string;
  color: string;
  displayName: string;
  name: string;
  /** The contact's own self-reported profile name. `name` falls back to
   *  this when no local override is set; clearing the override reverts to
   *  it. Empty for contacts that never sent a display name. */
  authName: string;
  profileImage: string | null;
  isVerified: boolean;
  isBlocked: boolean;
  wasSeenRecently: boolean;
};

export type SharedChat = {
  id: number;
  name: string;
  color: string;
  profileImage: string | null;
};

export type ChatInfoState = {
  full: FullChat | null;
  members: Contact[];
  sharedChats: SharedChat[];
  loaded: boolean;
};

export const chatInfo = $state<ChatInfoState>({
  full: null,
  members: [],
  sharedChats: [],
  loaded: false,
});

let loadGen = 0;

export async function loadChatInfo(accountId: number, chatId: number): Promise<void> {
  const gen = ++loadGen;
  chatInfo.loaded = false;
  try {
    const full = await rpc.call<FullChat>('get_full_chat_by_id', [accountId, chatId]);
    if (gen !== loadGen) return;

    let members: Contact[] = [];
    if (full.contactIds.length > 0) {
      const map = await rpc.call<Record<number, Contact>>('get_contacts_by_ids', [
        accountId,
        full.contactIds,
      ]);
      if (gen !== loadGen) return;
      members = full.contactIds.map((cid) => map[cid]).filter(Boolean);
    }

    const sharedChats = await fetchSharedChats(accountId, full);
    if (gen !== loadGen) return;

    chatInfo.full = full;
    chatInfo.members = members;
    chatInfo.sharedChats = sharedChats;
  } catch (err) {
    console.warn('chatInfo load failed', err);
  } finally {
    if (gen === loadGen) chatInfo.loaded = true;
  }
}

// `get_chatlist_items_by_entries` returns a PascalCase-tagged wire union;
// we unwrap to the clean `SharedChat[]` shape at this boundary so the UI
// never sees the discriminator.
type ChatListEntry =
  | { kind: 'ChatListItem'; id: number; name: string; color: string; avatarPath?: string | null }
  | { kind: 'ArchiveLink' }
  | { kind: 'Error' };

async function fetchSharedChats(accountId: number, full: FullChat): Promise<SharedChat[]> {
  // "Shared Chats" is a 1:1-only affordance: it lists every other chat the
  // single other contact is in. For groups/broadcasts there's no canonical
  // "other" peer.
  if (full.chatType !== 'Single') return [];
  const other = full.contactIds.find((cid) => cid !== 1);
  if (other == null) return [];
  try {
    const ids = await rpc.call<number[]>('get_chatlist_entries', [accountId, null, null, other]);
    const otherIds = ids.filter((id) => id !== full.id && id !== 0);
    if (otherIds.length === 0) return [];
    const map = await rpc.call<Record<number, ChatListEntry>>(
      'get_chatlist_items_by_entries',
      [accountId, otherIds],
    );
    const out: SharedChat[] = [];
    for (const id of otherIds) {
      const item = map[id];
      if (!item || item.kind !== 'ChatListItem') continue;
      out.push({
        id: item.id,
        name: item.name,
        color: item.color,
        profileImage: item.avatarPath ?? null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function renameChat(accountId: number, chatId: number, name: string): Promise<void> {
  await rpc.call('set_chat_name', [accountId, chatId, name]);
  await loadChatInfo(accountId, chatId);
}

/** Set the display name for a contact — the 1:1 equivalent of `renameChat`.
 *  A 1:1 chat's name is derived from its contact, so `set_chat_name` doesn't
 *  apply; this overrides the name locally, like Delta Chat's "Edit Name".
 *  Reloads the open chat info so the new name is reflected. */
export async function changeContactName(
  accountId: number,
  contactId: number,
  name: string,
): Promise<void> {
  await rpc.call('change_contact_name', [accountId, contactId, name]);
  const chatId = chatInfo.full?.id;
  if (chatId != null) await loadChatInfo(accountId, chatId);
}

export async function setEphemeralTimer(
  accountId: number,
  chatId: number,
  seconds: number,
): Promise<void> {
  await rpc.call('set_chat_ephemeral_timer', [accountId, chatId, seconds]);
  await loadChatInfo(accountId, chatId);
}

export async function leaveGroupChat(accountId: number, chatId: number): Promise<void> {
  await rpc.call('leave_group', [accountId, chatId]);
}

export async function deleteChatLocally(accountId: number, chatId: number): Promise<void> {
  await rpc.call('delete_chat', [accountId, chatId]);
}

export async function blockChatContact(accountId: number, contactId: number): Promise<void> {
  await rpc.call('block_contact', [accountId, contactId]);
}

export async function removeChatMember(
  accountId: number,
  chatId: number,
  memberId: number,
): Promise<void> {
  await rpc.call('remove_contact_from_chat', [accountId, chatId, memberId]);
  await loadChatInfo(accountId, chatId);
}

/** Candidates for the add-member dialog: non-blocked contacts on this
 *  account minus self, minus current members. Past (kicked / left)
 *  members stay in the list — `add_contact_to_chat` re-adds them
 *  cleanly, and excluding them surprised users who'd just removed
 *  someone by mistake. */
export async function findAddMemberCandidates(
  accountId: number,
  query: string,
): Promise<Contact[]> {
  const full = chatInfo.full;
  if (full == null) return [];
  const all = await rpc.call<Contact[]>('get_contacts', [
    accountId,
    0,
    query.trim() || null,
  ]);
  const inGroup = new Set<number>(full.contactIds ?? []);
  return all.filter((c) => c.id !== 1 && !inGroup.has(c.id));
}

export async function addChatMembers(
  accountId: number,
  chatId: number,
  memberIds: number[],
): Promise<void> {
  for (const id of memberIds) {
    await rpc.call('add_contact_to_chat', [accountId, chatId, id]);
  }
  await loadChatInfo(accountId, chatId);
}

export async function setChatAvatar(
  accountId: number,
  chatId: number,
  path: string,
): Promise<void> {
  await rpc.call('set_chat_profile_image', [accountId, chatId, path]);
  await loadChatInfo(accountId, chatId);
}
