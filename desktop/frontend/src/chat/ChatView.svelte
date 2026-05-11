<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import {
    chat,
    setActiveChat,
    markNoticed,
    sendMessage,
    toggleReaction,
    deleteMessages,
    deleteMessagesForAll,
    forwardMessages,
    setReplyTo,
    setEditing,
    loadOlder,
    CONTACT_ID_SELF,
    MSG_STATE,
    type Message,
  } from '../lib/state/chat.svelte';
  import { uploadBlob, viewtypeForFile } from '../lib/files';
  import { jumpToMessage } from '../lib/state/jump';
  import { t } from '../lib/i18n/i18n.svelte';
  import { chatlist } from '../lib/state/chatlist.svelte';
  import MessageBubble from './MessageBubble.svelte';
  import InfoMessage from './InfoMessage.svelte';
  import Composer from './Composer.svelte';
  import ScrollToLatest from './ScrollToLatest.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import DeleteMessageDialog from './DeleteMessageDialog.svelte';
  import EmojiPicker from './EmojiPicker.svelte';
  import ChatPicker from './ChatPicker.svelte';
  import InChatSearch from './InChatSearch.svelte';
  import { onShortcut } from '../lib/shortcuts';

  type Props = {
    accountId: number;
    chatId: number;
  };

  let { accountId, chatId }: Props = $props();

  let scroller: HTMLDivElement | undefined = $state();
  let atBottom = $state(true);
  let newSinceScroll = $state(0);
  let scrolling = $state(false);
  let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;
  // Suppresses the per-bubble enter-transition while the chat is doing
  // its first-paint (otherwise every message in a long history would
  // burst-animate). Flipped to `false` shortly after the initial render
  // populates `chat.ids`, so only messages added *after* that point get
  // the fly-in.
  let firstPaint = $state(true);
  let firstPaintTimer: ReturnType<typeof setTimeout> | null = null;

  let isGroupOrBroadcast = $derived.by(() => {
    const item = chatlist.items.get(chatId);
    // ChatType is a serde-stringified enum: "Single" | "Group" | "Mailinglist"
    // | "OutBroadcast" | "InBroadcast". Show sender name + reaction counts
    // for everything except 1:1 chats.
    return item ? item.chatType !== 'Single' : false;
  });

  $effect(() => {
    setActiveChat({ accountId, chatId });
  });

  let lastSeenIds: number[] = [];
  $effect(() => {
    const ids = chat.ids;
    const newCount = ids.length - lastSeenIds.length;
    const newAppended = newCount > 0 && lastSeenIds.every((id, i) => ids[i] === id);
    lastSeenIds = ids.slice();
    if (atBottom) {
      void scrollToBottom();
    } else if (newAppended && newCount > 0) {
      newSinceScroll += newCount;
    }
    // Drop the first-paint guard once the initial batch has rendered.
    if (firstPaint && ids.length > 0) {
      if (firstPaintTimer != null) clearTimeout(firstPaintTimer);
      firstPaintTimer = setTimeout(() => (firstPaint = false), 60);
    }
  });
  onDestroy(() => {
    if (firstPaintTimer != null) clearTimeout(firstPaintTimer);
  });

  $effect(() => {
    void chat.active;
    void markNoticed();
  });
  function onVisibility() {
    if (!document.hidden) void markNoticed();
  }
  onMount(() => {
    document.addEventListener('visibilitychange', onVisibility);
  });
  onDestroy(() => {
    document.removeEventListener('visibilitychange', onVisibility);
  });

  // `tick` flushes Svelte's reconciliation, but layout/paint can still
  // grow afterwards as images and avatars load. We re-pin to the bottom
  // across a handful of animation frames so the initial scroll doesn't
  // strand the user mid-feed. Idempotent — subsequent calls just keep
  // pinning until the layout stops growing.
  async function scrollToBottom(): Promise<void> {
    if (!scroller) return;
    await tick();
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
    for (let i = 0; i < 6; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (!scroller) return;
      scroller.scrollTop = scroller.scrollHeight;
    }
    atBottom = true;
    newSinceScroll = 0;
  }

  // Distance from the top below which we trigger pagination. Set high
  // enough that a fast scroll-up flings load older messages *before* the
  // user hits the absolute top (so they don't see an empty top-state).
  const LOAD_OLDER_THRESHOLD_PX = 240;

  async function maybeLoadOlder(): Promise<void> {
    if (!scroller) return;
    if (chat.loadingOlder || !chat.hasMoreOlder) return;
    if (scroller.scrollTop > LOAD_OLDER_THRESHOLD_PX) return;
    // Capture viewport anchor so the user's view stays put after older
    // messages are prepended — without this, scrollTop stays at the same
    // pixel offset, but `scrollHeight` grows, so the visible content jumps.
    const beforeHeight = scroller.scrollHeight;
    const beforeTop = scroller.scrollTop;
    const added = await loadOlder();
    if (!scroller || added === 0) return;
    await tick();
    if (!scroller) return;
    const delta = scroller.scrollHeight - beforeHeight;
    scroller.scrollTop = beforeTop + delta;
  }

  function onScroll() {
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const next = distance < 64;
    if (next !== atBottom) {
      atBottom = next;
      if (atBottom) newSinceScroll = 0;
    }
    void maybeLoadOlder();
    // Show the scrollbar thumb while the user is actively scrolling, hide it
    // again ~800 ms after they stop. Mirrors the macOS/iOS overlay-scrollbar
    // behaviour without relying on the deprecated `overflow: overlay`.
    scrolling = true;
    if (scrollIdleTimer != null) clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => (scrolling = false), 800);
  }

  function dayMarker(prev: Message | undefined, curr: Message): string | null {
    const cd = new Date(curr.sortTimestamp * 1000);
    if (!prev) return labelForDate(cd);
    const pd = new Date(prev.sortTimestamp * 1000);
    if (
      cd.getFullYear() !== pd.getFullYear() ||
      cd.getMonth() !== pd.getMonth() ||
      cd.getDate() !== pd.getDate()
    ) {
      return labelForDate(cd);
    }
    return null;
  }
  function labelForDate(d: Date): string {
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    if (sameDay) return 'Today';
    const yest = new Date(today);
    yest.setDate(today.getDate() - 1);
    const isYesterday =
      d.getFullYear() === yest.getFullYear() &&
      d.getMonth() === yest.getMonth() &&
      d.getDate() === yest.getDate();
    if (isYesterday) return 'Yesterday';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
  }

  // Context menu / emoji picker / forward picker -----------------------------

  let contextOpen = $state<{ message: Message; x: number; y: number } | null>(null);
  let pickerOpen = $state(false);
  let pickerTarget = $state<number | null>(null);
  let forwardOpen = $state(false);
  let forwardTargets = $state<number[]>([]);
  let findOpen = $state(false);
  let deleteTarget = $state<{ id: number; canDeleteForAll: boolean } | null>(null);

  onMount(() => {
    const offFind = onShortcut('in-chat-search', () => (findOpen = true));
    const offEsc = onShortcut('escape', () => {
      if (findOpen) findOpen = false;
    });
    return () => {
      offFind();
      offEsc();
    };
  });

  function openContext(m: Message, x: number, y: number) {
    contextOpen = { message: m, x, y };
  }

  function closeContext() {
    contextOpen = null;
  }

  function onPickEmoji(emoji: string) {
    if (!contextOpen) return;
    void toggleReaction(contextOpen.message.id, emoji);
  }

  function onMoreEmoji() {
    if (!contextOpen) return;
    pickerTarget = contextOpen.message.id;
    pickerOpen = true;
  }

  function onPickerEmoji(emoji: string) {
    if (pickerTarget != null) void toggleReaction(pickerTarget, emoji);
    pickerOpen = false;
    pickerTarget = null;
  }

  function actionsFor(m: Message) {
    const actions: {
      label: string;
      icon?: import('../lib/Icon.svelte').IconName;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
    }[] = [];
    actions.push({
      label: t('Reply'),
      icon: 'reply',
      onSelect: () => setReplyTo(m.id),
    });
    if (m.text) {
      actions.push({
        label: t('Copy'),
        icon: 'copy',
        onSelect: () => void navigator.clipboard.writeText(m.text),
      });
    }
    actions.push({
      label: t('Forward'),
      icon: 'forward',
      onSelect: () => {
        forwardTargets = [m.id];
        forwardOpen = true;
      },
    });
    if (m.fromId === CONTACT_ID_SELF && m.viewType === 'Text') {
      actions.push({
        label: t('Edit'),
        icon: 'pencil',
        onSelect: () => setEditing(m.id),
      });
    }
    actions.push({
      label: t('Delete'),
      icon: 'trash-2',
      danger: true,
      onSelect: () => {
        // Core only accepts a recall for own messages that already left the
        // outbox. Anything else (incoming, draft, pending, failed) can only
        // be removed locally — match iOS by hiding the for-everyone option.
        const canDeleteForAll =
          m.fromId === CONTACT_ID_SELF &&
          (m.state === MSG_STATE.OutDelivered || m.state === MSG_STATE.OutMdnRcvd);
        deleteTarget = { id: m.id, canDeleteForAll };
      },
    });
    return actions;
  }

  async function onForwardPicked(targetChatId: number) {
    forwardOpen = false;
    try {
      await forwardMessages(forwardTargets, targetChatId);
    } catch (err) {
      alert(`Forward failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    forwardTargets = [];
  }

  function jumpTo(msgId: number) {
    if (!chat.ids.includes(msgId)) return;
    jumpToMessage(msgId);
  }

  // -------- drag and drop --------
  // Counter, not boolean — dragenter/dragleave fire as the cursor crosses
  // child boundaries, so a plain flag would flicker on every nested element.
  let dragDepth = $state(0);
  let dragActive = $derived(dragDepth > 0);
  let dropSending = $state(false);

  function hasFiles(e: DragEvent): boolean {
    return Array.from(e.dataTransfer?.types ?? []).includes('Files');
  }
  function onDragEnter(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth += 1;
  }
  function onDragOver(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }
  function onDragLeave(e: DragEvent) {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
  }
  async function onDrop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    dropSending = true;
    try {
      for (const file of files) {
        const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase();
        const path = await uploadBlob(file, ext);
        await sendMessage({
          viewtype: viewtypeForFile(file),
          file: path,
          filename: file.name,
        });
      }
    } catch (err) {
      alert(`Send failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      dropSending = false;
    }
  }
</script>

<div
  class="chat-view"
  role="region"
  aria-label={t('Conversation')}
  ondragenter={onDragEnter}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  {#if dragActive}
    <div class="drop-overlay" role="presentation">
      <div class="drop-card">
        <div class="drop-icon" aria-hidden="true">⤓</div>
        <div class="drop-title">{dropSending ? t('Sending…') : t('Drop to send')}</div>
        <div class="drop-hint">{t('Files attach as image, video, audio, or document.')}</div>
      </div>
    </div>
  {/if}
  <InChatSearch
    {accountId}
    {chatId}
    open={findOpen}
    onClose={() => (findOpen = false)}
  />
  <!-- Wrapper so the floating ScrollToLatest button positions relative to
       the bottom of the message list — not the bottom of the whole
       chat-view, which would put it on top of the composer. -->
  <div class="scroll-area">
  <div
    class="scroll"
    class:scrolling
    bind:this={scroller}
    onscroll={onScroll}
    role="log"
    aria-live="polite"
    aria-relevant="additions"
  >
    {#if chat.loading && chat.ids.length === 0}
      <div class="empty muted">{t('Loading messages…')}</div>
    {:else if chat.ids.length === 0}
      <div class="empty">
        <p class="muted">{t('No messages yet — say hi!')}</p>
      </div>
    {:else}
      {#each chat.ids as id, i (id)}
        {@const m = chat.messages.get(id)}
        {#if m}
          {@const prev = i > 0 ? chat.messages.get(chat.ids[i - 1]) : undefined}
          {@const marker = dayMarker(prev, m)}
          {#if marker}
            <div class="daymarker"><span>{marker}</span></div>
          {/if}
          <div
            id="msg-{id}"
            in:fly={{ y: 12, duration: firstPaint ? 0 : 220, easing: cubicOut }}
          >
            {#if m.isInfo}
              <InfoMessage message={m} />
            {:else}
              <MessageBubble
                message={m}
                showSender={isGroupOrBroadcast}
                showReactionCount={isGroupOrBroadcast}
                onContextMenu={openContext}
                onJumpToMessage={jumpTo}
              />
            {/if}
          </div>
        {/if}
      {/each}
    {/if}
  </div>

    <ScrollToLatest
      visible={!atBottom}
      count={newSinceScroll}
      onClick={() => void scrollToBottom()}
    />
  </div>

  <Composer />
</div>

{#if contextOpen}
  <ContextMenu
    message={contextOpen.message}
    x={contextOpen.x}
    y={contextOpen.y}
    onPickEmoji={onPickEmoji}
    onMoreEmoji={onMoreEmoji}
    actions={actionsFor(contextOpen.message)}
    onClose={closeContext}
  />
{/if}

<EmojiPicker
  open={pickerOpen}
  onPick={onPickerEmoji}
  onClose={() => {
    pickerOpen = false;
    pickerTarget = null;
  }}
/>

<ChatPicker
  open={forwardOpen}
  onPick={(id) => void onForwardPicked(id)}
  onClose={() => {
    forwardOpen = false;
    forwardTargets = [];
  }}
/>

<DeleteMessageDialog
  open={deleteTarget != null}
  canDeleteForAll={deleteTarget?.canDeleteForAll ?? false}
  onDeleteForMe={() => {
    if (deleteTarget) void deleteMessages([deleteTarget.id]);
  }}
  onDeleteForAll={() => {
    if (deleteTarget) void deleteMessagesForAll([deleteTarget.id]);
  }}
  onClose={() => (deleteTarget = null)}
/>

<style>
  .chat-view {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .drop-overlay {
    position: absolute;
    inset: var(--space-3);
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--color-accent) 14%, transparent);
    backdrop-filter: blur(4px);
    pointer-events: none;
    border: 2px dashed var(--color-accent);
    border-radius: var(--radius-lg);
  }
  .drop-card {
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-6);
    box-shadow: 0 16px 48px var(--color-shadow);
    text-align: center;
    max-width: 360px;
  }
  .drop-icon {
    font-size: 48px;
    line-height: 1;
    margin-bottom: var(--space-3);
    color: var(--color-accent);
  }
  .drop-title {
    font-size: var(--text-lg);
    font-weight: 600;
    margin-bottom: var(--space-2);
  }
  .drop-hint {
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .scroll-area {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3) 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    /* Reserve space for the scrollbar always so toggling its visibility
     * doesn't reflow the content. Firefox honours scrollbar-color +
     * transition; webkit needs the explicit thumb pseudo-element below. */
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    transition: scrollbar-color 0.3s ease;
  }
  .scroll.scrolling {
    scrollbar-color: var(--color-fg-tertiary) transparent;
  }
  .scroll::-webkit-scrollbar {
    width: 8px;
  }
  .scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .scroll::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 4px;
    transition: background 0.3s ease;
  }
  .scroll.scrolling::-webkit-scrollbar-thumb {
    background: var(--color-fg-tertiary);
  }
  .scroll.scrolling::-webkit-scrollbar-thumb:hover {
    background: var(--color-fg-secondary);
  }
  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .muted {
    color: var(--color-fg-tertiary);
    font-size: var(--text-md);
  }
  .daymarker {
    display: flex;
    justify-content: center;
    margin: var(--space-3) 0;
  }
  .daymarker span {
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
    background: var(--color-bg-hover);
    padding: 2px 10px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
