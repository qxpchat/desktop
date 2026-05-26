<script lang="ts">
  import { tick, onDestroy } from 'svelte';
  import {
    sendText,
    sendMessage,
    stageContact,
    stageAttachment,
    stageAttachmentFromPath,
    clearPendingAttachments,
    removePendingAttachment,
    chat,
    setReplyTo,
    setEditing,
    CONTACT_ID_SELF,
  } from '../lib/state/chat.svelte';
  import { invoke, isTauri } from '@tauri-apps/api/core';
  import { uploadBlob } from '../lib/files';
  import { VoiceRecorder, pickMimeType, extensionForMime } from '../lib/audio/recorder';
  import AttachMenu from './AttachMenu.svelte';
  import AttachmentBar from './AttachmentBar.svelte';
  import ContactPickerModal from './ContactPickerModal.svelte';
  import EmojiPicker from './EmojiPicker.svelte';
  import GifPicker from './GifPicker.svelte';
  import GifPendingPill from './GifPendingPill.svelte';
  import QuoteBar from './QuoteBar.svelte';
  import IconButton from '../lib/IconButton.svelte';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import { cacheGif } from '../lib/gifs/cache';
  import { t } from '../lib/i18n/i18n.svelte';

  let text = $state('');
  let sending = $state(false);
  let textarea: HTMLTextAreaElement | undefined = $state();
  let attachOpen = $state(false);
  let emojiOpen = $state(false);
  let gifPickerOpen = $state(false);
  let gifCaching = $state(false);
  let pendingGif = $state<{ url: string; term: string; localPath: string } | null>(null);
  let contactPickerOpen = $state(false);
  // Shared alert-dialog message — replaces native `alert()`.
  let notice = $state<string | null>(null);

  function insertEmoji(c: string) {
    const ta = textarea;
    if (!ta) {
      text = text + c;
      return;
    }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    text = text.slice(0, start) + c + text.slice(end);
    void tick().then(() => {
      ta.focus();
      const caret = start + c.length;
      ta.setSelectionRange(caret, caret);
    });
  }

  let fileInput: HTMLInputElement | undefined = $state();

  // Reset draft when the active chat changes (Phase 18 will swap this for
  // per-chat persistent drafts).
  let activeKey = $derived(chat.active ? `${chat.active.accountId}:${chat.active.chatId}` : '');
  let lastKey = '';
  function draftKey(k: string) {
    return `qxp.web.draft.${k}`;
  }
  $effect(() => {
    if (activeKey !== lastKey) {
      // Save outgoing draft for previous chat (or clear if empty).
      if (lastKey) {
        if (text.length > 0) localStorage.setItem(draftKey(lastKey), text);
        else localStorage.removeItem(draftKey(lastKey));
      }
      lastKey = activeKey;
      // Hydrate draft for new chat.
      if (activeKey) {
        const stored = localStorage.getItem(draftKey(activeKey)) ?? '';
        text = stored;
      } else {
        text = '';
      }
    }
  });
  // Persist on every keystroke (small writes — fine for localStorage).
  $effect(() => {
    if (!activeKey) return;
    if (text.length > 0) localStorage.setItem(draftKey(activeKey), text);
    else localStorage.removeItem(draftKey(activeKey));
  });

  // When the user toggles edit mode on a message, seed the textarea with its
  // current text so they can revise. Escape (handled in onKeyDown) is what
  // resets `text` on exit; this effect only owns the seed-on-enter side.
  // The `tick()` is load-bearing: the textarea's `scrollHeight` is only
  // correct after Svelte flushes the new value to the DOM, so autosize must
  // wait or it measures the *previous* (empty) content and leaves the field
  // at min-height for a multi-line message.
  let lastEditingId: number | null = null;
  $effect(() => {
    const id = chat.editingId;
    if (id === lastEditingId) return;
    lastEditingId = id;
    if (id != null) {
      const m = chat.messages.get(id);
      if (m) {
        text = m.text;
        void tick().then(() => {
          autosize();
          textarea?.focus();
        });
      }
    }
  });

  let replyTarget = $derived(chat.replyToId != null ? (chat.messages.get(chat.replyToId) ?? null) : null);
  let editTarget = $derived(chat.editingId != null ? (chat.messages.get(chat.editingId) ?? null) : null);
  let pendingAttachments = $derived(chat.pendingAttachments);

  let canSend = $derived(
    !sending &&
      chat.active != null &&
      (text.trim().length > 0 || pendingAttachments.length > 0 || pendingGif != null),
  );

  // Switching chats while a GIF is staged would otherwise leak the
  // selection across — clear it so the new chat starts clean.
  $effect(() => {
    void activeKey;
    pendingGif = null;
  });

  // Drop a chosen GIF into the local cache and stage it as a pending pill.
  // Cache + record happen here so the pill thumbnail is the same file the
  // outgoing message will resolve to in the chat.
  async function onPickGif(g: { url: string; term: string }) {
    gifPickerOpen = false;
    if (chat.active == null) return;
    gifCaching = true;
    try {
      const localPath = await cacheGif(g.url);
      pendingGif = { url: g.url, term: g.term, localPath };
    } catch (err) {
      notice = `${t('Could not fetch GIF')}: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      gifCaching = false;
    }
  }

  async function send() {
    if (!canSend) return;
    const atts = pendingAttachments;
    const gif = pendingGif;
    const toSend = text;
    sending = true;
    try {
      if (gif) {
        // GIFs travel as plain-text messages — the body is the giphy URL,
        // which the receiver's MessageBubble re-resolves to a cached file
        // for inline animation. Caption and reply ride a separate text
        // message after the GIF so the URL stays a single segment (the
        // bubble's gif detector requires it).
        pendingGif = null;
        const trimmed = toSend.trim();
        const replyToFirst = chat.replyToId ?? undefined;
        await sendMessage({ viewtype: 'Text', text: gif.url, quotedMessageId: replyToFirst });
        if (trimmed.length > 0) {
          await sendMessage({ viewtype: 'Text', text: trimmed });
        }
        if (chat.replyToId != null) setReplyTo(null);
      } else if (atts.length > 0) {
        const trimmed = toSend.trim();
        // deltachat is one-file-per-message: fan the staged files out into
        // N messages. The caption and the reply quote ride the first
        // message only; the rest are sent bare.
        for (let i = 0; i < atts.length; i++) {
          const att = atts[i];
          await sendMessage({
            viewtype: att.viewtype,
            file: att.file,
            filename: att.filename,
            text: i === 0 && trimmed.length > 0 ? trimmed : undefined,
            quotedMessageId: i === 0 ? (chat.replyToId ?? undefined) : undefined,
          });
        }
        clearPendingAttachments();
        if (chat.replyToId != null) setReplyTo(null);
      } else {
        await sendText(toSend);
      }
      text = '';
      await tick();
      autosize();
      textarea?.focus();
    } catch {
      /* error stored on chat.error */
    } finally {
      sending = false;
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.isComposing) {
      e.preventDefault();
      void send();
      return;
    }
    // Escape cancels the active edit (and clears the pre-filled body) or
    // active reply target. Falls through to the global Escape handler when
    // there's nothing composer-local to clear.
    if (e.key === 'Escape' && !e.isComposing) {
      if (chat.editingId != null) {
        e.preventDefault();
        e.stopPropagation();
        setEditing(null);
        text = '';
        return;
      }
      if (chat.replyToId != null) {
        e.preventDefault();
        e.stopPropagation();
        setReplyTo(null);
        return;
      }
    }
    // Bare ArrowUp on an empty composer = recall the user's last own text
    // message into the edit slot (WhatsApp/iMessage shortcut). If the
    // composer already has text, let the textarea handle the key normally
    // so cursor navigation isn't hijacked.
    if (
      e.key === 'ArrowUp' &&
      !e.shiftKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.isComposing &&
      text.length === 0 &&
      chat.editingId == null &&
      chat.replyToId == null
    ) {
      const lastOwnId = findLastOwnEditableMessage();
      if (lastOwnId != null) {
        e.preventDefault();
        setEditing(lastOwnId);
      }
    }
  }

  function findLastOwnEditableMessage(): number | null {
    for (let i = chat.ids.length - 1; i >= 0; i--) {
      const id = chat.ids[i];
      const m = chat.messages.get(id);
      if (!m) continue;
      if (m.fromId !== CONTACT_ID_SELF) continue;
      if (m.isInfo) continue;
      if (m.viewType !== 'Text') continue; // core only edits text
      return id;
    }
    return null;
  }

  function autosize() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const max = 8 * 22;
    textarea.style.height = Math.min(textarea.scrollHeight, max) + 'px';
  }

  $effect(() => {
    void text;
    autosize();
  });

  // ---------- attachments ----------

  // Shared "stage a file, surface failures" wrapper for the file picker and
  // both paste paths.
  async function stageOrWarn(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      notice = `${t('Could not attach file')}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Ctrl/Cmd+V handling, two cases:
  //  - Inline image *data* (screenshot, "copy image") arrives as a file item
  //    on the paste event — stage it straight away.
  //  - A file copied in Finder puts only a *reference* on the clipboard;
  //    WebKit's paste event surfaces just the filename text. The path isn't
  //    available synchronously, so we let the text land, read the native
  //    pasteboard, and — if it held a file — revert the text and stage it.
  function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind !== 'file' || !it.type.startsWith('image/')) continue;
        const file = it.getAsFile();
        if (!file) continue;
        e.preventDefault();
        void stageOrWarn(() => stageAttachment(namedPasteImage(file)));
        return;
      }
    }
    if (isTauri()) void reconcilePastedFile(text);
  }

  // `before` = the textarea contents captured before the default paste runs.
  async function reconcilePastedFile(before: string): Promise<void> {
    let paths: string[];
    try {
      paths = await invoke<string[]>('clipboard_file_paths');
    } catch {
      return; // command unavailable — leave the default text paste alone
    }
    if (paths.length === 0) return; // a genuine text paste
    text = before; // drop the filename the default paste inserted
    for (const p of paths) await stageOrWarn(() => stageAttachmentFromPath(p));
  }

  // Pasted images usually arrive nameless — give them a real filename so the
  // attachment and its upload temp file get a sensible extension.
  function namedPasteImage(file: File): File {
    if (/\.[a-z0-9]+$/i.test(file.name)) return file;
    const ext =
      file.type === 'image/jpeg'
        ? 'jpg'
        : file.type === 'image/gif'
          ? 'gif'
          : file.type === 'image/webp'
            ? 'webp'
            : 'png';
    return new File([file], `pasted-image.${ext}`, { type: file.type });
  }

  // Stage the picked contact as a pending attachment — the user adds an
  // optional caption and sends with the normal send button. Mirrors the
  // file-attach flow rather than firing the message immediately.
  async function shareContact(contactId: number) {
    try {
      await stageContact(contactId);
    } catch (err) {
      notice = `${t('Could not share contact')}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // ---------- voice ----------

  let recorder: VoiceRecorder | null = null;
  let recording = $state(false);
  let recElapsed = $state(0);
  let recInterval: ReturnType<typeof setInterval> | null = null;
  // Voice is only really available when *both* MediaRecorder and
  // mediaDevices.getUserMedia exist. The latter is only present in secure
  // contexts (HTTPS or localhost) — accessing the dev server from a LAN
  // hostname over plain HTTP leaves `navigator.mediaDevices` undefined and
  // would otherwise let the mic button throw on click.
  let voiceSupported = $state(
    pickMimeType() != null &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function',
  );

  onDestroy(() => {
    if (recInterval != null) clearInterval(recInterval);
    if (recorder) recorder.cancel();
  });

  async function startRecording() {
    if (!voiceSupported) {
      notice = t('Voice recording is not supported in this browser.');
      return;
    }
    try {
      recorder = new VoiceRecorder();
      await recorder.start();
      recording = true;
      recElapsed = 0;
      recInterval = setInterval(() => {
        recElapsed = recorder?.elapsedMs() ?? 0;
      }, 100);
    } catch (err) {
      recorder = null;
      notice = `${t('Could not start recording')}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function stopAndSend() {
    if (!recorder) return;
    if (recInterval != null) clearInterval(recInterval);
    recInterval = null;
    sending = true;
    try {
      const result = await recorder.stop();
      // Extension follows the actual recorded container. WKWebView /
      // Safari → AAC-in-MP4 (.m4a, plays everywhere). Firefox →
      // Ogg/Opus (.ogg). Chromium → WebM/Opus (.weba). The recorder's
      // candidate ordering prefers the most universal containers, so on
      // qxp's typical desktop targets the receiving Delta Chat client
      // gets a file it can actually play.
      const ext = extensionForMime(result.mimeType);
      const path = await uploadBlob(result.blob, ext);
      await sendMessage({
        viewtype: 'Voice',
        file: path,
        filename: `voice.${ext}`,
      });
    } catch (err) {
      notice = `${t('Send failed')}: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      recorder = null;
      recording = false;
      recElapsed = 0;
      sending = false;
    }
  }

  function cancelRecording() {
    if (recInterval != null) clearInterval(recInterval);
    recInterval = null;
    recorder?.cancel();
    recorder = null;
    recording = false;
    recElapsed = 0;
  }

  function fmtElapsed(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  async function onFilePicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    for (const f of files) await stageOrWarn(() => stageAttachment(f));
  }
</script>

<div class="composer-stack">
  {#if editTarget}
    <QuoteBar target={editTarget} mode="edit" onClose={() => setEditing(null)} />
  {:else if replyTarget}
    <QuoteBar target={replyTarget} mode="reply" onClose={() => setReplyTo(null)} />
  {/if}
  {#each pendingAttachments as att, i (i)}
    <AttachmentBar attachment={att} onClose={() => removePendingAttachment(i)} />
  {/each}
  {#if pendingGif}
    <GifPendingPill gif={pendingGif} onClose={() => (pendingGif = null)} />
  {/if}
  <div class="composer" data-testid="composer">
  {#if recording}
    <IconButton
      variant="danger"
      icon="x"
      iconSize={18}
      label={t('Cancel recording')}
      onclick={cancelRecording}
    />
    <div class="rec-status">
      <span class="rec-dot" aria-hidden="true"></span>
      {t('Recording…')} {fmtElapsed(recElapsed)}
    </div>
    <IconButton
      variant="primary"
      icon="send"
      iconSize={18}
      label={t('Send voice message')}
      onclick={stopAndSend}
      disabled={sending}
      data-testid="composer__send"
    />
  {:else}
  <IconButton
    variant="subtle"
    icon="paperclip"
    iconSize={18}
    label={t('Attach')}
    title={t('Attach')}
    aria-expanded={attachOpen}
    onclick={() => (attachOpen = !attachOpen)}
    disabled={chat.active == null}
    data-testid="composer__attach"
  />

  <AttachMenu
    open={attachOpen}
    onClose={() => (attachOpen = false)}
    onPickFile={() => fileInput?.click()}
    onShareContact={() => (contactPickerOpen = true)}
  />

  <input bind:this={fileInput} type="file" multiple hidden onchange={onFilePicked} data-testid="composer__file-input" />

  <textarea
    bind:this={textarea}
    bind:value={text}
    onkeydown={onKeyDown}
    onpaste={onPaste}
    placeholder={t('Type a message…')}
    rows="1"
    aria-label={t('Message text')}
    disabled={chat.active == null}
    data-testid="composer__textarea"
  ></textarea>

  <IconButton
    variant="subtle"
    icon="gif"
    iconSize={20}
    label={t('Insert GIF')}
    title={t('GIF')}
    aria-expanded={gifPickerOpen}
    active={gifPickerOpen}
    onclick={() => (gifPickerOpen = true)}
    disabled={chat.active == null || gifCaching}
    data-testid="composer__gif"
  />
  <div class="emoji-wrap">
    <IconButton
      variant="subtle"
      icon="smile"
      iconSize={20}
      label={t('Insert emoji')}
      title={t('Emoji')}
      aria-expanded={emojiOpen}
      active={emojiOpen}
      onclick={() => (emojiOpen = !emojiOpen)}
      disabled={chat.active == null}
      data-testid="composer__emoji"
    />
    <EmojiPicker
      open={emojiOpen}
      onPick={insertEmoji}
      onClose={() => (emojiOpen = false)}
    />
  </div>

  {#if text.trim().length === 0 && pendingAttachments.length === 0 && pendingGif == null}
    {#if voiceSupported}
      <IconButton
        variant="subtle"
        icon="mic"
        iconSize={18}
        label={t('Record voice message')}
        title={t('Voice message')}
        onclick={startRecording}
        disabled={chat.active == null}
      />
    {/if}
    <!-- No send button when there's nothing to send and voice is unavailable;
         hiding it avoids a permanently-disabled placeholder. -->
  {:else}
    <IconButton
      variant="primary"
      icon="send"
      iconSize={18}
      label={t('Send message')}
      title={t('Send (Enter)')}
      disabled={!canSend}
      onclick={send}
      data-testid="composer__send"
    />
  {/if}
  {/if}
  </div>
</div>

<ContactPickerModal
  open={contactPickerOpen}
  onPick={(id) => void shareContact(id)}
  onClose={() => (contactPickerOpen = false)}
/>

<GifPicker
  open={gifPickerOpen}
  accountId={chat.active?.accountId ?? null}
  onPick={onPickGif}
  onClose={() => (gifPickerOpen = false)}
/>

<ConfirmDialog
  open={notice != null}
  mode="alert"
  title={notice ?? ''}
  onClose={() => (notice = null)}
/>

<style>
  .composer-stack {
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
  }
  .composer {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    padding: var(--space-3);
  }
  textarea {
    flex: 1;
    min-height: 36px;
    max-height: 176px;
    padding: 8px 12px;
    border-radius: 18px;
    border: none;
    background: var(--color-bg-pane);
    color: var(--color-fg);
    font-family: inherit;
    /* Match the bubble body so you don't get a step-down when reading
     * what you just typed vs. what you sent. */
    font-size: var(--text-lg);
    line-height: 1.4;
    resize: none;
    outline: none;
    /* The native scrollbar that appears when the textarea grows past
     * max-height looks like a small button hanging off the right edge.
     * Hide it cross-browser; scrolling still works via wheel / arrow keys. */
    scrollbar-width: none;
  }
  textarea::-webkit-scrollbar {
    display: none;
  }
  textarea:focus {
    outline: none;
  }
  textarea:disabled {
    opacity: 0.6;
  }
  .emoji-wrap {
    position: relative;
    flex: 0 0 auto;
  }
  /* The picker is rendered inside `.emoji-wrap` (which is itself
   * `position: relative`); pin it above the button so it floats over the
   * chat list instead of pushing the composer up. */
  .emoji-wrap :global(.picker) {
    bottom: calc(100% + var(--space-2));
    right: 0;
  }
  .rec-status {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-fg);
    font-size: var(--text-md);
    padding: 0 var(--space-3);
    height: 36px;
    border: 1px solid var(--color-border);
    border-radius: 18px;
    background: var(--color-bg);
  }
  .rec-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-danger, #b00);
    animation: pulse 1s infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }
</style>
