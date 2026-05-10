// Active chat state — message list, send pipeline, live updates.
//
// Holds at most one chat's messages at a time (the one selected in pane 3).
// `setActiveChat({ accountId, chatId })` swaps to a new chat: clears the
// existing list, refetches via `get_message_ids` + `get_messages`. Live
// updates come from the deltachat event poll loop:
//   - IncomingMsg{chatId, msgId}              -> fetch + append
//   - MsgsChanged{chatId, msgId}               -> patch single message
//   - MsgsChanged{chatId, msgId=0}             -> full reload
//   - MsgDelivered/MsgRead/MsgFailed{chatId,msgId} -> patch single message
//
// Sending: `sendText(text)` calls misc_send_text_message and immediately
// fetches the returned msg_id so the bubble shows up fast (rather than waiting
// for the matching MsgsChanged event).

import { rpc } from '../rpc';
import { onEvent, type DcEvent } from '../events';

/** Self contact id in deltachat-core (always 1). */
export const CONTACT_ID_SELF = 1;

export type MessageViewtype =
  | 'Unknown'
  | 'Text'
  | 'Image'
  | 'Gif'
  | 'Sticker'
  | 'Audio'
  | 'Voice'
  | 'Video'
  | 'File'
  | 'Call'
  | 'Webxdc'
  | 'Vcard';

/** Subset of MessageState we care about for the UI. */
export const MSG_STATE = {
  Undefined: 0,
  InFresh: 10,
  InNoticed: 13,
  InSeen: 16,
  OutPreparing: 18,
  OutDraft: 19,
  OutPending: 20,
  OutFailed: 24,
  OutDelivered: 26,
  OutMdnRcvd: 28,
} as const;

export type Sender = {
  id: number;
  displayName: string;
  color: string;
  profileImage: string | null;
  isVerified: boolean;
};

export type Message = {
  id: number;
  chatId: number;
  fromId: number;
  text: string;
  isEdited: boolean;
  isInfo: boolean;
  isForwarded: boolean;
  isBot: boolean;
  hasLocation: boolean;
  hasHtml: boolean;
  viewType: MessageViewtype;
  state: number;
  error: string | null;
  timestamp: number; // unix seconds
  sortTimestamp: number;
  receivedTimestamp: number;
  subject: string;
  duration: number;
  dimensionsHeight: number;
  dimensionsWidth: number;
  overrideSenderName: string | null;
  sender: Sender;
  file: string | null;
  fileMime: string | null;
  fileBytes: number;
  fileName: string | null;
  systemMessageType: string;
  infoContactId: number | null;
  parentId: number | null;
  quote: unknown;
  reactions: unknown;
  vcardContact: unknown;
  showPadlock: boolean;
};

type MessageLoadResult =
  | { kind: 'message'; [k: string]: unknown }
  | { kind: 'loadingError'; error: string };

export type ActiveChat = {
  accountId: number;
  chatId: number;
};

export type ChatState = {
  active: ActiveChat | null;
  /** Display-order ids (oldest first). */
  ids: number[];
  /** Message payload by id. */
  messages: Map<number, Message>;
  loading: boolean;
  /** Most recent error from a load/send. Cleared on next successful load. */
  error: string | null;
  /** Composer state: id of message being replied to (quote-reply). */
  replyToId: number | null;
  /** Composer state: id of own message being edited. */
  editingId: number | null;
  /** Highlight pulse target — ChatView animates the bubble briefly on jump. */
  highlightId: number | null;
};

export const chat = $state<ChatState>({
  active: null,
  ids: [],
  messages: new Map(),
  loading: false,
  error: null,
  replyToId: null,
  editingId: null,
  highlightId: null,
});

export function setReplyTo(id: number | null): void {
  chat.replyToId = id;
  chat.editingId = null;
}

export function setEditing(id: number | null): void {
  chat.editingId = id;
  chat.replyToId = null;
}

export function flashMessage(id: number): void {
  chat.highlightId = id;
  setTimeout(() => {
    if (chat.highlightId === id) chat.highlightId = null;
  }, 1200);
}

let loadGen = 0;

export function setActiveChat(active: ActiveChat | null): void {
  if (sameChat(active, chat.active)) return;
  chat.active = active;
  chat.ids = [];
  chat.messages = new Map();
  chat.error = null;
  chat.replyToId = null;
  chat.editingId = null;
  chat.highlightId = null;
  if (active != null) void loadAll();
}

function sameChat(a: ActiveChat | null, b: ActiveChat | null): boolean {
  if (a == null || b == null) return a === b;
  return a.accountId === b.accountId && a.chatId === b.chatId;
}

async function loadAll(): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  const gen = ++loadGen;
  chat.loading = true;
  try {
    const ids = await rpc.call<number[]>('get_message_ids', [
      active.accountId,
      active.chatId,
      false,
      false,
    ]);
    if (gen !== loadGen || !sameChat(active, chat.active)) return;

    const map = await rpc.call<Record<number, MessageLoadResult>>('get_messages', [
      active.accountId,
      ids,
    ]);
    if (gen !== loadGen || !sameChat(active, chat.active)) return;

    const messages = new Map<number, Message>();
    const visibleIds: number[] = [];
    for (const id of ids) {
      const r = map[id];
      if (r && r.kind === 'message') {
        messages.set(id, r as unknown as Message);
        visibleIds.push(id);
      }
    }
    chat.ids = visibleIds;
    chat.messages = messages;
    chat.error = null;
  } catch (err) {
    if (gen === loadGen) chat.error = errString(err);
  } finally {
    if (gen === loadGen) chat.loading = false;
  }
}

async function patchMessage(msgId: number, opts: { appendIfNew: boolean }): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  try {
    const map = await rpc.call<Record<number, MessageLoadResult>>('get_messages', [
      active.accountId,
      [msgId],
    ]);
    if (!sameChat(active, chat.active)) return;
    const r = map[msgId];
    if (!r || r.kind !== 'message') return;
    const m = r as unknown as Message;
    // Defensive: this message might belong to a different chat (deltachat
    // sometimes broadcasts MsgsChanged across chats). Drop if so.
    if (m.chatId !== active.chatId) return;

    const next = new Map(chat.messages);
    next.set(msgId, m);
    chat.messages = next;
    if (opts.appendIfNew && !chat.ids.includes(msgId)) {
      chat.ids = [...chat.ids, msgId];
    }
  } catch (err) {
    console.warn('chat.patchMessage failed:', err);
  }
}

function isForActiveChat(ev: DcEvent): boolean {
  if (chat.active == null) return false;
  if (ev.contextId !== chat.active.accountId) return false;
  const evChatId = ev.event.chatId;
  return typeof evChatId === 'number' && evChatId === chat.active.chatId;
}

onEvent('IncomingMsg', (ev) => {
  if (!isForActiveChat(ev)) return;
  const msgId = ev.event.msgId;
  if (typeof msgId === 'number') void patchMessage(msgId, { appendIfNew: true });
});

onEvent('MsgsChanged', (ev) => {
  if (!isForActiveChat(ev)) return;
  const msgId = ev.event.msgId;
  if (typeof msgId === 'number' && msgId !== 0) {
    void patchMessage(msgId, { appendIfNew: true });
  } else {
    void loadAll();
  }
});

for (const kind of ['MsgDelivered', 'MsgRead', 'MsgFailed'] as const) {
  onEvent(kind, (ev) => {
    if (!isForActiveChat(ev)) return;
    const msgId = ev.event.msgId;
    if (typeof msgId === 'number') void patchMessage(msgId, { appendIfNew: false });
  });
}

export async function sendText(text: string): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  const trimmed = text.trim();
  if (trimmed.length === 0) return;
  try {
    if (chat.editingId != null) {
      await rpc.call('send_edit_request', [active.accountId, chat.editingId, trimmed]);
      const editing = chat.editingId;
      chat.editingId = null;
      await patchMessage(editing, { appendIfNew: false });
      return;
    }
    if (chat.replyToId != null) {
      await sendMessage({ text: trimmed, viewtype: 'Text', quotedMessageId: chat.replyToId });
      chat.replyToId = null;
      return;
    }
    const msgId = await rpc.call<number>('misc_send_text_message', [
      active.accountId,
      active.chatId,
      trimmed,
    ]);
    if (typeof msgId === 'number') {
      await patchMessage(msgId, { appendIfNew: true });
    }
  } catch (err) {
    chat.error = errString(err);
    throw err;
  }
}

/** Generic send via `sendMsg` — used for attachments, locations, vcards. */
export type MessageData = {
  text?: string;
  html?: string;
  viewtype?: MessageViewtype;
  file?: string;
  filename?: string;
  location?: [number, number];
  overrideSenderName?: string;
  quotedMessageId?: number;
  quotedText?: string;
};

export async function sendMessage(data: MessageData): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  try {
    const msgId = await rpc.call<number>('send_msg', [active.accountId, active.chatId, data]);
    if (typeof msgId === 'number') {
      await patchMessage(msgId, { appendIfNew: true });
    }
  } catch (err) {
    chat.error = errString(err);
    throw err;
  }
}

export async function deleteMessages(ids: number[]): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  try {
    await rpc.call('delete_messages', [active.accountId, ids]);
    const next = new Map(chat.messages);
    for (const id of ids) next.delete(id);
    chat.messages = next;
    chat.ids = chat.ids.filter((id) => !ids.includes(id));
  } catch (err) {
    chat.error = errString(err);
  }
}

export async function forwardMessages(ids: number[], targetChatId: number): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  try {
    await rpc.call('forward_messages', [active.accountId, ids, targetChatId]);
  } catch (err) {
    chat.error = errString(err);
    throw err;
  }
}

export async function toggleReaction(messageId: number, emoji: string): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  const m = chat.messages.get(messageId);
  // The deltachat reaction model is "replace your set" — every send of
  // sendReaction clobbers your prior reactions on that message. To match the
  // tap-to-toggle UX iOS uses, we read your existing reactions and either
  // strip the emoji (if already set) or replace with [emoji].
  const reactions = m?.reactions as
    | { reactionsByContact?: Record<number, string[]> }
    | undefined;
  const mine = reactions?.reactionsByContact?.[CONTACT_ID_SELF] ?? [];
  const next = mine.includes(emoji) ? [] : [emoji];
  try {
    await rpc.call('send_reaction', [active.accountId, messageId, next]);
    await patchMessage(messageId, { appendIfNew: false });
  } catch (err) {
    chat.error = errString(err);
  }
}

export async function markNoticed(): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  try {
    await rpc.call('marknoticed_chat', [active.accountId, active.chatId]);
  } catch {
    /* best-effort */
  }
}

function errString(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
