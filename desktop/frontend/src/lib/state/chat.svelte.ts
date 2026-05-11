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
  /** Full ordered list of every message id in the chat (oldest first).
   *  Cheap to fetch — just integers from `get_message_ids`. We don't render
   *  these directly; rendering is gated by `ids`. */
  allIds: number[];
  /** Loaded slice of `allIds` — the messages whose payload is in `messages`
   *  and whose bubbles are currently rendered. Starts as the newest
   *  `INITIAL_WINDOW`, grows backwards via `loadOlder()` as the user scrolls
   *  up. Always a contiguous suffix of `allIds`. */
  ids: number[];
  /** Message payload by id. */
  messages: Map<number, Message>;
  loading: boolean;
  /** True while a `loadOlder` RPC is in flight — used to debounce
   *  scroll-triggered loads. */
  loadingOlder: boolean;
  /** Whether `ids` covers `allIds` from the start. False = there are older
   *  messages still to fetch. */
  hasMoreOlder: boolean;
  /** Most recent error from a load/send. Cleared on next successful load. */
  error: string | null;
  /** Composer state: id of message being replied to (quote-reply). */
  replyToId: number | null;
  /** Composer state: id of own message being edited. */
  editingId: number | null;
  /** Highlight pulse target — ChatView animates the bubble briefly on jump. */
  highlightId: number | null;
};

// Initial render window + pagination step. 50 keeps the first paint cheap;
// scrolling up loads the next 50. Big enough that most chats fit in one
// page, small enough that opening a 10k-message chat is instant.
const INITIAL_WINDOW = 50;
const PAGE_SIZE = 50;

export const chat = $state<ChatState>({
  active: null,
  allIds: [],
  ids: [],
  messages: new Map(),
  loading: false,
  loadingOlder: false,
  hasMoreOlder: false,
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
  chat.allIds = [];
  chat.ids = [];
  chat.messages = new Map();
  chat.hasMoreOlder = false;
  chat.loadingOlder = false;
  chat.error = null;
  chat.replyToId = null;
  chat.editingId = null;
  chat.highlightId = null;
  if (active != null) void loadInitial();
}

function sameChat(a: ActiveChat | null, b: ActiveChat | null): boolean {
  if (a == null || b == null) return a === b;
  return a.accountId === b.accountId && a.chatId === b.chatId;
}

/** Fetch all ids (cheap) + the newest INITIAL_WINDOW messages. */
async function loadInitial(): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  const gen = ++loadGen;
  chat.loading = true;
  try {
    const allIds = await rpc.call<number[]>('get_message_ids', [
      active.accountId,
      active.chatId,
      false,
      false,
    ]);
    if (gen !== loadGen || !sameChat(active, chat.active)) return;

    const window = allIds.slice(Math.max(0, allIds.length - INITIAL_WINDOW));
    const map = await rpc.call<Record<number, MessageLoadResult>>('get_messages', [
      active.accountId,
      window,
    ]);
    if (gen !== loadGen || !sameChat(active, chat.active)) return;

    const messages = new Map<number, Message>();
    const visibleIds: number[] = [];
    for (const id of window) {
      const r = map[id];
      if (r && r.kind === 'message') {
        messages.set(id, r as unknown as Message);
        visibleIds.push(id);
      }
    }
    chat.allIds = allIds;
    chat.ids = visibleIds;
    chat.messages = messages;
    chat.hasMoreOlder = visibleIds.length < allIds.length;
    chat.error = null;
  } catch (err) {
    if (gen === loadGen) chat.error = errString(err);
  } finally {
    if (gen === loadGen) chat.loading = false;
  }
}

/** Convenience for code paths that previously called `loadAll()` — fetches
 *  every id and reloads the full window. Used after a full-reload event
 *  (`MsgsChanged` with msgId=0). The current visible window keeps its
 *  size when possible so the user's scroll position is preserved. */
async function loadAll(): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  const gen = ++loadGen;
  chat.loading = true;
  try {
    const allIds = await rpc.call<number[]>('get_message_ids', [
      active.accountId,
      active.chatId,
      false,
      false,
    ]);
    if (gen !== loadGen || !sameChat(active, chat.active)) return;

    const targetCount = Math.max(INITIAL_WINDOW, chat.ids.length);
    const window = allIds.slice(Math.max(0, allIds.length - targetCount));
    const map = await rpc.call<Record<number, MessageLoadResult>>('get_messages', [
      active.accountId,
      window,
    ]);
    if (gen !== loadGen || !sameChat(active, chat.active)) return;

    const messages = new Map<number, Message>();
    const visibleIds: number[] = [];
    for (const id of window) {
      const r = map[id];
      if (r && r.kind === 'message') {
        messages.set(id, r as unknown as Message);
        visibleIds.push(id);
      }
    }
    chat.allIds = allIds;
    chat.ids = visibleIds;
    chat.messages = messages;
    chat.hasMoreOlder = visibleIds.length < allIds.length;
    chat.error = null;
  } catch (err) {
    if (gen === loadGen) chat.error = errString(err);
  } finally {
    if (gen === loadGen) chat.loading = false;
  }
}

/** Extend the loaded window backwards by `PAGE_SIZE`. Returns the number of
 *  newly loaded ids — callers (ChatView) use this to preserve scroll
 *  position when the prepended bubbles change `scrollHeight`. */
export async function loadOlder(): Promise<number> {
  const active = chat.active;
  if (active == null || !chat.hasMoreOlder || chat.loadingOlder) return 0;
  chat.loadingOlder = true;
  const gen = loadGen;
  try {
    const startInAll = chat.allIds.length - chat.ids.length;
    const from = Math.max(0, startInAll - PAGE_SIZE);
    const toLoad = chat.allIds.slice(from, startInAll);
    if (toLoad.length === 0) {
      chat.hasMoreOlder = false;
      return 0;
    }
    const map = await rpc.call<Record<number, MessageLoadResult>>('get_messages', [
      active.accountId,
      toLoad,
    ]);
    if (gen !== loadGen || !sameChat(active, chat.active)) return 0;
    const next = new Map(chat.messages);
    const prepended: number[] = [];
    for (const id of toLoad) {
      const r = map[id];
      if (r && r.kind === 'message') {
        next.set(id, r as unknown as Message);
        prepended.push(id);
      }
    }
    chat.messages = next;
    chat.ids = [...prepended, ...chat.ids];
    chat.hasMoreOlder = chat.ids.length < chat.allIds.length;
    return prepended.length;
  } catch (err) {
    chat.error = errString(err);
    return 0;
  } finally {
    if (gen === loadGen) chat.loadingOlder = false;
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
    if (opts.appendIfNew) {
      if (!chat.allIds.includes(msgId)) {
        chat.allIds = [...chat.allIds, msgId];
      }
      if (!chat.ids.includes(msgId)) {
        chat.ids = [...chat.ids, msgId];
      }
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
    const toDelete = new Set(ids);
    for (const id of ids) next.delete(id);
    chat.messages = next;
    chat.ids = chat.ids.filter((id) => !toDelete.has(id));
    chat.allIds = chat.allIds.filter((id) => !toDelete.has(id));
  } catch (err) {
    chat.error = errString(err);
  }
}

// "Delete for everyone" — sends a recall request to recipients in addition
// to removing the message locally. Core enforces that only own, already-sent
// messages can be recalled.
export async function deleteMessagesForAll(ids: number[]): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  try {
    await rpc.call('delete_messages_for_all', [active.accountId, ids]);
    const next = new Map(chat.messages);
    const toDelete = new Set(ids);
    for (const id of ids) next.delete(id);
    chat.messages = next;
    chat.ids = chat.ids.filter((id) => !toDelete.has(id));
    chat.allIds = chat.allIds.filter((id) => !toDelete.has(id));
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
