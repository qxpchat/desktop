<script lang="ts">
  import { tick, onDestroy } from 'svelte';
  import {
    sendText,
    sendMessage,
    chat,
    setReplyTo,
    setEditing,
    type MessageData,
  } from '../lib/state/chat.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import { rpc } from '../lib/rpc';
  import { uploadBlob, viewtypeForFile } from '../lib/files';
  import { VoiceRecorder, pickMimeType, extensionForMime } from '../lib/audio/recorder';
  import AttachMenu from './AttachMenu.svelte';
  import ContactPickerModal from './ContactPickerModal.svelte';
  import EmojiPicker from './EmojiPicker.svelte';
  import QuoteBar from './QuoteBar.svelte';
  import Icon from '../lib/Icon.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  let text = $state('');
  let sending = $state(false);
  let textarea: HTMLTextAreaElement | undefined = $state();
  let attachOpen = $state(false);
  let emojiOpen = $state(false);
  let contactPickerOpen = $state(false);

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
  // current text so they can revise.
  let lastEditingId: number | null = null;
  $effect(() => {
    const id = chat.editingId;
    if (id !== lastEditingId) {
      lastEditingId = id;
      if (id != null) {
        const m = chat.messages.get(id);
        if (m) text = m.text;
      } else {
        // dropped out of edit mode
        if (text === '' && lastKey) text = '';
      }
    }
  });

  let replyTarget = $derived(chat.replyToId != null ? (chat.messages.get(chat.replyToId) ?? null) : null);
  let editTarget = $derived(chat.editingId != null ? (chat.messages.get(chat.editingId) ?? null) : null);

  let canSend = $derived(text.trim().length > 0 && !sending && chat.active != null);

  async function send() {
    if (!canSend) return;
    const toSend = text;
    sending = true;
    try {
      await sendText(toSend);
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
    }
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

  async function pushFile(file: File): Promise<void> {
    const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase();
    sending = true;
    try {
      const path = await uploadBlob(file, ext);
      const data: MessageData = {
        viewtype: viewtypeForFile(file),
        file: path,
        filename: file.name,
        text: text || undefined,
      };
      text = '';
      await sendMessage(data);
    } catch (err) {
      alert(`Send failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      sending = false;
    }
  }

  async function shareLocation() {
    if (!navigator.geolocation) {
      alert('Geolocation is not available.');
      return;
    }
    sending = true;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        });
      });
      await sendMessage({
        viewtype: 'Text',
        text: text || `My location: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
        location: [pos.coords.latitude, pos.coords.longitude],
      });
      text = '';
    } catch (err) {
      alert(`Could not get location: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      sending = false;
    }
  }

  async function shareContact(contactId: number) {
    if (accounts.selectedId == null) return;
    sending = true;
    try {
      const vcard = await rpc.call<string>('make_vcard', [accounts.selectedId, [contactId]]);
      const blob = new Blob([vcard], { type: 'text/vcard' });
      const path = await uploadBlob(blob, 'vcf');
      await sendMessage({
        viewtype: 'Vcard',
        file: path,
        filename: 'contact.vcf',
        text: text || undefined,
      });
      text = '';
    } catch (err) {
      alert(`Could not share contact: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      sending = false;
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
      alert('Voice recording is not supported in this browser.');
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
      alert(`Could not start recording: ${err instanceof Error ? err.message : String(err)}`);
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
      alert(`Send failed: ${err instanceof Error ? err.message : String(err)}`);
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

  function onFilePicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void pushFile(file);
    input.value = '';
  }
</script>

<div class="composer-stack">
  {#if editTarget}
    <QuoteBar target={editTarget} mode="edit" onClose={() => setEditing(null)} />
  {:else if replyTarget}
    <QuoteBar target={replyTarget} mode="reply" onClose={() => setReplyTo(null)} />
  {/if}
  <div class="composer">
  {#if recording}
    <button class="cancel-rec" onclick={cancelRecording} aria-label={t('Cancel recording')}>
      <Icon name="x" size={18} />
    </button>
    <div class="rec-status">
      <span class="rec-dot" aria-hidden="true"></span>
      {t('Recording…')} {fmtElapsed(recElapsed)}
    </div>
    <button class="send" onclick={stopAndSend} aria-label={t('Send voice message')} disabled={sending}>
      <Icon name="send" size={18} />
    </button>
  {:else}
  <button
    class="attach"
    onclick={() => (attachOpen = !attachOpen)}
    aria-label={t('Attach')}
    aria-expanded={attachOpen}
    title={t('Attach')}
    disabled={chat.active == null}
  >
    <Icon name="paperclip" size={18} />
  </button>

  <AttachMenu
    open={attachOpen}
    onClose={() => (attachOpen = false)}
    onPickFile={() => fileInput?.click()}
    onShareLocation={() => void shareLocation()}
    onShareContact={() => (contactPickerOpen = true)}
  />

  <input bind:this={fileInput} type="file" hidden onchange={onFilePicked} />

  <textarea
    bind:this={textarea}
    bind:value={text}
    onkeydown={onKeyDown}
    placeholder={t('Type a message…')}
    rows="1"
    aria-label={t('Message text')}
    disabled={chat.active == null}
  ></textarea>

  <div class="emoji-wrap">
    <button
      class="emoji-btn"
      class:active={emojiOpen}
      onclick={() => (emojiOpen = !emojiOpen)}
      aria-label={t('Insert emoji')}
      aria-expanded={emojiOpen}
      title={t('Emoji')}
      disabled={chat.active == null}
    >
      <Icon name="smile" size={20} />
    </button>
    <EmojiPicker
      open={emojiOpen}
      onPick={insertEmoji}
      onClose={() => (emojiOpen = false)}
    />
  </div>

  {#if text.trim().length === 0}
    {#if voiceSupported}
      <button
        class="mic"
        onclick={startRecording}
        aria-label={t('Record voice message')}
        title={t('Voice message')}
        disabled={chat.active == null}
      >
        <Icon name="mic" size={18} />
      </button>
    {/if}
    <!-- No send button when there's nothing to send and voice is unavailable;
         hiding it avoids a permanently-disabled placeholder. -->
  {:else}
    <button
      class="send"
      disabled={!canSend}
      onclick={send}
      aria-label={t('Send message')}
      title={t('Send (Enter)')}
    >
      <Icon name="send" size={18} />
    </button>
  {/if}
  {/if}
  </div>
</div>

<ContactPickerModal
  open={contactPickerOpen}
  onPick={(id) => void shareContact(id)}
  onClose={() => (contactPickerOpen = false)}
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
  .attach {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: var(--color-fg-secondary);
    font-size: 18px;
    justify-content: center;
  }
  .attach:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .attach:disabled {
    opacity: 0.4;
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
    outline: 1px solid var(--color-accent);
    outline-offset: -1px;
  }
  textarea:disabled {
    opacity: 0.6;
  }
  .send {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .send:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .send:not(:disabled):hover {
    filter: brightness(1.05);
  }
  .emoji-wrap {
    position: relative;
    flex: 0 0 auto;
  }
  .emoji-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: var(--color-fg-secondary);
    font-size: 18px;
  }
  .emoji-btn:hover:not(:disabled),
  .emoji-btn.active {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .emoji-btn:disabled {
    opacity: 0.4;
  }
  /* The picker is rendered inside `.emoji-wrap` (which is itself
   * `position: relative`); pin it above the button so it floats over the
   * chat list instead of pushing the composer up. */
  .emoji-wrap :global(.picker) {
    bottom: calc(100% + var(--space-2));
    right: 0;
  }
  .mic {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: var(--color-fg-secondary);
    font-size: 16px;
    justify-content: center;
  }
  .mic:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .cancel-rec {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: var(--color-danger, #b00);
    font-size: 16px;
    justify-content: center;
  }
  .cancel-rec:hover {
    background: var(--color-bg-hover);
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
