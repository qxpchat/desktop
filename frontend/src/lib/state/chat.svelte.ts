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
import { windowFocus } from './windowFocus.svelte';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  fileUrl,
  isImageViewtype,
  uploadBlob,
  viewtypeForFile,
  viewtypeForName,
} from '../files';

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

/** Icon + semantic kind for an outgoing message-state indicator. ChatListRow
 *  and MessageBubble share this mapping; the only difference is whether the
 *  caller has already gated on "outgoing." Incoming states always return null. */
export type StateGlyph = { icon: 'loader' | 'check' | 'check-check' | 'alert-circle'; kind: 'pending' | 'delivered' | 'read' | 'failed' };
export function messageStateGlyph(state: number): StateGlyph | null {
  switch (state) {
    case MSG_STATE.OutPreparing:
    case MSG_STATE.OutPending:
      return { icon: 'loader', kind: 'pending' };
    case MSG_STATE.OutDelivered:
      return { icon: 'check', kind: 'delivered' };
    case MSG_STATE.OutMdnRcvd:
      return { icon: 'check-check', kind: 'read' };
    case MSG_STATE.OutFailed:
      return { icon: 'alert-circle', kind: 'failed' };
    default:
      return null;
  }
}

/** Whether deltachat-core will accept a "delete for everyone" recall for
 *  this message. Mirrors core: only the user's own messages that have
 *  already been delivered (or had a read-receipt) can be recalled. */
export function canRecallMessage(m: { fromId: number; state: number }): boolean {
  return (
    m.fromId === CONTACT_ID_SELF &&
    (m.state === MSG_STATE.OutDelivered || m.state === MSG_STATE.OutMdnRcvd)
  );
}

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

export type PendingAttachment = {
  viewtype: MessageViewtype;
  /** What `send_msg`'s `file` field receives. Either a daemon path under
   *  `_uploads/` (file-picker / HTML drop, uploaded as bytes) or a raw OS
   *  path (Tauri drag-drop) — core copies into the blobdir either way. */
  file: string;
  filename: string;
  /** URL for an image thumbnail in the composer preview, or null for a type
   *  icon. Uploads use a daemon `/file` URL; Tauri drag-drop uses an `asset:`
   *  URL (`convertFileSrc`) — scoped to `$HOME` in tauri.conf.json. */
  previewUrl: string | null;
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
  /** Composer state: file staged for sending alongside the next message.
   *  Set by drag-drop / attach-menu pick; cleared by send or by the user
   *  hitting the X on the attachment preview. At most one file at a time
   *  (extras are rejected — deltachat sends one file per message). */
  pendingAttachment: PendingAttachment | null;
  /** Highlight pulse target — ChatView animates the bubble briefly on jump. */
  highlightId: number | null;
  /** Active jump-to-message target. Set by `jumpToMessage` for the
   *  duration of the switch-chat / paginate / scroll pipeline; ChatView
   *  suppresses its auto-scroll-to-bottom while this is non-null so the
   *  scroll-into-view of the target bubble isn't swallowed by the
   *  bottom-pin loop that runs after each `chat.ids` change. */
  jumpTargetId: number | null;
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
  pendingAttachment: null,
  highlightId: null,
  jumpTargetId: null,
});

export function setReplyTo(id: number | null): void {
  chat.replyToId = id;
  chat.editingId = null;
}

export function setEditing(id: number | null): void {
  chat.editingId = id;
  chat.replyToId = null;
  // Editing an existing message can't carry a new attachment — clear the
  // staged file so we don't silently lose it on the next send.
  chat.pendingAttachment = null;
}

export function setPendingAttachment(att: PendingAttachment | null): void {
  chat.pendingAttachment = att;
  // Staging an attachment exits edit mode — you can't attach a file to an
  // existing-message edit request (core only edits text). Reply mode stays
  // intact since "reply with a file" is a normal action.
  if (att != null) chat.editingId = null;
}

let flashGen = 0;
export function flashMessage(id: number): void {
  chat.highlightId = id;
  const my = ++flashGen;
  setTimeout(() => {
    // Only clear if no newer flash superseded us — back-to-back jumps
    // would otherwise have the first timer kill the second's highlight.
    if (flashGen === my) chat.highlightId = null;
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
  chat.pendingAttachment = null;
  chat.highlightId = null;
  // `jumpTargetId` deliberately *not* cleared here: when a search hit
  // for a different chat fires the jump, `selectChat` → `setActiveChat`
  // runs *before* the jump pipeline reaches its scroll step, and clearing
  // here would re-enable the auto-scroll-to-bottom that we set the flag
  // to suppress in the first place. `jumpToMessage` owns the lifecycle.
  if (active != null) void loadInitial();
}

function sameChat(a: ActiveChat | null, b: ActiveChat | null): boolean {
  if (a == null || b == null) return a === b;
  return a.accountId === b.accountId && a.chatId === b.chatId;
}

/** Refetch all ids + hydrate the newest `targetCount` messages.
 *  - `loadInitial` (active-chat swap) passes INITIAL_WINDOW.
 *  - `loadAll` (full-reload event, msgId=0) preserves the current visible
 *    window size so the user's scroll position survives. */
async function loadWindow(targetCount: number): Promise<void> {
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

const loadInitial = (): Promise<void> => loadWindow(INITIAL_WINDOW);
const loadAll = (): Promise<void> => loadWindow(Math.max(INITIAL_WINDOW, chat.ids.length));

/** Hydrate `toLoad` (a contiguous prefix of `chat.allIds` that's older than
 *  the current `chat.ids` head) and prepend its successfully-loaded ids
 *  onto `chat.ids`. Returns the number of ids actually prepended. Bails
 *  silently if the active chat changed during the RPC await. */
async function prependMessages(toLoad: number[]): Promise<number> {
  const active = chat.active;
  if (active == null || toLoad.length === 0) return 0;
  const map = await rpc.call<Record<number, MessageLoadResult>>('get_messages', [
    active.accountId,
    toLoad,
  ]);
  if (!sameChat(active, chat.active)) return 0;
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
}

/** Extend the loaded window backwards by `PAGE_SIZE`. Returns the number of
 *  newly loaded ids — callers (ChatView) use this to preserve scroll
 *  position when the prepended bubbles change `scrollHeight`. */
export async function loadOlder(): Promise<number> {
  if (!chat.hasMoreOlder || chat.loadingOlder) return 0;
  chat.loadingOlder = true;
  try {
    const startInAll = chat.allIds.length - chat.ids.length;
    const from = Math.max(0, startInAll - PAGE_SIZE);
    const toLoad = chat.allIds.slice(from, startInAll);
    if (toLoad.length === 0) {
      chat.hasMoreOlder = false;
      return 0;
    }
    return await prependMessages(toLoad);
  } catch (err) {
    chat.error = errString(err);
    return 0;
  } finally {
    chat.loadingOlder = false;
  }
}

/** Extend the loaded window backwards until `msgId` is part of `chat.ids`.
 *  Returns true when the message ends up in (or already was in) the window;
 *  false if it isn't in this chat at all. Used by the jump-to-message
 *  pipeline to handle quote-taps / search hits / media-browser entries
 *  that point at messages older than the currently rendered window. */
export async function loadUntilInWindow(msgId: number): Promise<boolean> {
  if (chat.active == null) return false;
  if (chat.ids.includes(msgId)) return true;

  const idx = chat.allIds.indexOf(msgId);
  if (idx === -1) return false; // not in this chat
  const startInAll = chat.allIds.length - chat.ids.length;
  if (idx >= startInAll) return true; // already covered (race-safe re-check)

  const toLoad = chat.allIds.slice(idx, startInAll);
  if (toLoad.length === 0) return true;

  chat.loadingOlder = true;
  try {
    await prependMessages(toLoad);
    return chat.ids.includes(msgId);
  } catch (err) {
    chat.error = errString(err);
    return false;
  } finally {
    chat.loadingOlder = false;
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
  // Mark noticed eagerly only when the window has *focus* — being merely
  // visible (in the background but not minimized) doesn't mean the user
  // has actually read the new message. The chat-row badge stays until
  // they click back in, at which point the `focus` listener in ChatView
  // fires markNoticed.
  if (windowFocus.focused) {
    void markNoticed();
  }
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

// `ReactionsChanged` carries `chatId` + `msgId` like the delivery-state
// events, and the reactions blob is part of the message payload re-fetched
// by `patchMessage`. Without this, peer reactions only showed after a
// chat reopen because no other event in the rotation touches the bubble.
for (const kind of ['MsgDelivered', 'MsgRead', 'MsgFailed', 'ReactionsChanged'] as const) {
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

/** Generic send via `sendMsg` — used for attachments, vcards. */
export type MessageData = {
  text?: string;
  html?: string;
  viewtype?: MessageViewtype;
  file?: string;
  filename?: string;
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

/** Upload `file` (as bytes) and stage it as the chat's pending attachment so
 *  the user can add a caption before sending. The `_uploads/`-backed copy is
 *  servable by the daemon, so image attachments get a thumbnail preview.
 *  Replaces any previously staged file. */
export async function stageAttachment(file: File): Promise<void> {
  if (chat.active == null) return;
  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase();
  const path = await uploadBlob(file, ext);
  const viewtype = viewtypeForFile(file);
  setPendingAttachment({
    viewtype,
    file: path,
    filename: file.name,
    previewUrl: isImageViewtype(viewtype) ? (fileUrl(path) ?? null) : null,
  });
}

/** Stage an OS-path source (Tauri drag-drop) without an upload round-trip —
 *  `send_msg` copies the file into the blobdir at send time. Image previews
 *  load the OS path straight into the webview via Tauri's asset protocol. */
export async function stageAttachmentFromPath(localPath: string): Promise<void> {
  if (chat.active == null) return;
  const name = basename(localPath);
  const viewtype = viewtypeForName(name);
  setPendingAttachment({
    viewtype,
    file: localPath,
    filename: name,
    previewUrl: isImageViewtype(viewtype) ? convertFileSrc(localPath) : null,
  });
}

function basename(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/** Build a vcard for `contactId` via `make_vcard`, upload it, and stage it
 *  as the chat's pending attachment — so the user can add a caption and
 *  send deliberately, matching the file/image attach flow (and Delta
 *  Chat's `addContactAsVcard` → draft behaviour). */
export async function stageContact(contactId: number): Promise<void> {
  const active = chat.active;
  if (active == null) return;
  const vcard = await rpc.call<string>('make_vcard', [active.accountId, [contactId]]);
  const blob = new Blob([vcard], { type: 'text/vcard' });
  const path = await uploadBlob(blob, 'vcf');
  // Name the staged file after the contact so the composer preview is
  // legible; fall back to a generic name if the lookup fails.
  let filename = 'contact.vcf';
  try {
    const c = await rpc.call<{ displayName?: string; address?: string }>('get_contact', [
      active.accountId,
      contactId,
    ]);
    const base = (c.displayName || c.address || 'contact').replace(/[^\w.-]+/g, '_');
    filename = `${base}.vcf`;
  } catch {
    /* keep the generic name */
  }
  setPendingAttachment({
    viewtype: 'Vcard',
    file: path,
    filename,
    previewUrl: null,
  });
}

/** Hydrate a batch of messages by id, filtering out load-errors at the
 *  state-module boundary so callers receive a clean `Message[]` without the
 *  `kind: 'message' | 'loadingError'` wire discriminator. Used by
 *  MediaBrowser and the message-search results pane. */
export async function loadMessages(accountId: number, ids: number[]): Promise<Message[]> {
  if (ids.length === 0) return [];
  const map = await rpc.call<Record<number, MessageLoadResult>>('get_messages', [accountId, ids]);
  const out: Message[] = [];
  for (const id of ids) {
    const r = map[id];
    if (r && r.kind === 'message') out.push(r as unknown as Message);
  }
  return out;
}

function errString(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
