<script lang="ts">
  import { onMount, onDestroy, tick, untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import {
    chat,
    setActiveChat,
    markNoticed,
    flashMessage,
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
  import ReactionDetailSheet from './ReactionDetailSheet.svelte';
  import Icon from '../lib/Icon.svelte';
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
    // Suppress the bottom-pin loop while a jump is in flight — `loadInitial`
    // and `loadUntilInWindow` both grow `chat.ids`, and the 6-frame
    // `scrollToBottom` would otherwise swallow the jump's scrollIntoView.
    // The `untrack` is load-bearing: if we read `chat.jumpTargetId`
    // reactively, then clearing it (the jump-target effect below does
    // this after scrolling) re-fires this effect within the same
    // microtask — before the programmatic scroll has settled onscroll
    // and flipped `atBottom`. Result: `scrollToBottom` runs and clobbers
    // the jump. Reading without tracking severs that feedback loop.
    let jumpInFlight = false;
    untrack(() => {
      jumpInFlight = chat.jumpTargetId != null;
    });
    if (atBottom && !jumpInFlight) {
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

  // Jump-to-message: `jumpToMessage` (lib/state/jump.ts) sets
  // `chat.jumpTargetId`, then runs the switch-chat + paginate pipeline.
  // We own the scroll: when the target lands in `chat.ids`, flash +
  // scroll from inside the same render cycle that mounted the bubble.
  // Doing it here (rather than in jump.ts) avoids the race where the
  // external scroll fires before Svelte commits the new bubble, or
  // where the bottom-pin loop is still running when we try to scroll.
  $effect(() => {
    const target = chat.jumpTargetId;
    if (target == null) return;
    if (!chat.ids.includes(target)) return;
    untrack(() => {
      void (async () => {
        // Brief poll for the DOM element: an extra microtask gives the
        // `{#each}` block a chance to commit the appended/prepended
        // bubble, and a few rAF ticks cover any deferred work (image
        // decoding, fly-in transition, etc.) that might keep the
        // initial mount partial.
        let el: HTMLElement | null = null;
        for (let i = 0; i < 30; i++) {
          await tick();
          if (scroller) {
            const found = document.getElementById(`msg-${target}`);
            if (found) {
              el = found;
              break;
            }
          }
          await new Promise((r) => setTimeout(r, 30));
        }
        if (!el || !scroller) {
          chat.jumpTargetId = null;
          return;
        }
        flashMessage(target);
        // Explicit scrollTop: scrollIntoView's smooth animation can be
        // clobbered by sibling renders / image-decode reflows. Compute
        // the offset within the scroller and pin scrollTop directly,
        // then let scrollIntoView do its smooth pass on top.
        const containerRect = scroller.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const offsetWithinScroller = elRect.top - containerRect.top + scroller.scrollTop;
        const desiredScrollTop = Math.max(
          0,
          offsetWithinScroller - scroller.clientHeight / 2 + elRect.height / 2,
        );
        scroller.scrollTop = desiredScrollTop;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        chat.jumpTargetId = null;
      })();
    });
  });

  $effect(() => {
    void chat.active;
    // Opening a chat is a deliberate user action — they just clicked the
    // row, the window must be focused, so always mark noticed here even
    // before the focus-state listeners spin up.
    void markNoticed();
  });
  // Re-mark on window focus only — being merely *visible* (window in the
  // background but not minimized) doesn't mean the user has actually read
  // anything, so the badge should persist until they click back in.
  function onWindowFocus() {
    void markNoticed();
  }
  onMount(() => {
    window.addEventListener('focus', onWindowFocus);
  });
  onDestroy(() => {
    window.removeEventListener('focus', onWindowFocus);
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
  let deleteTarget = $state<{ ids: number[]; canDeleteForAll: boolean } | null>(null);
  let reactorsTarget = $state<number | null>(null);

  // -------- multi-message selection --------
  // Mirrors `ChatViewModel.isSelecting` / `selectedMessageIds` from iOS. The
  // selection bar replaces the composer; bulk Forward / Copy / Delete use
  // the chronologically-ordered subset of `chat.ids`.
  let isSelecting = $state(false);
  let selectedIds = $state(new Set<number>());
  let selectedCount = $derived(selectedIds.size);
  let orderedSelected = $derived(chat.ids.filter((id) => selectedIds.has(id)));
  // "Delete for everyone" is offered only when every selected message is the
  // user's own outgoing message that already left the outbox (matches the
  // single-message path in `actionsFor`).
  let canDeleteSelectedForAll = $derived.by(() => {
    if (selectedIds.size === 0) return false;
    for (const id of selectedIds) {
      const m = chat.messages.get(id);
      if (!m) return false;
      if (m.fromId !== CONTACT_ID_SELF) return false;
      if (m.state !== MSG_STATE.OutDelivered && m.state !== MSG_STATE.OutMdnRcvd) return false;
    }
    return true;
  });

  function enterSelection(seedId: number) {
    closeContext();
    isSelecting = true;
    selectedIds = new Set([seedId]);
  }
  function exitSelection() {
    isSelecting = false;
    selectedIds = new Set();
  }
  function toggleSelection(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  // Drop the selection when the active chat changes — selected ids only
  // make sense within the chat that produced them. `untrack` keeps the
  // effect's dependency limited to `chat.active`; without it, the read of
  // `isSelecting` makes this effect re-fire after `enterSelection` flips it
  // to true, immediately undoing the very state change we want to keep.
  $effect(() => {
    void chat.active;
    untrack(() => {
      if (isSelecting) exitSelection();
    });
  });

  function onForwardSelected() {
    if (orderedSelected.length === 0) return;
    forwardTargets = orderedSelected;
    forwardOpen = true;
  }
  function onCopySelected() {
    const ids = orderedSelected;
    if (ids.length === 0) return;
    const items = ids
      .map((id) => chat.messages.get(id))
      .filter((m): m is Message => m != null);
    if (items.length === 0) return;
    let text: string;
    if (items.length === 1) {
      text = items[0].text ?? '';
    } else {
      // Multi-message: prefix each contiguous-sender run with "Sender:" and
      // join entries with blank lines. Mirrors deltachat-ios's clipboard
      // format (`copySelectedMessages` in `ChatViewModel`).
      const lines: string[] = [];
      let lastSender = '';
      for (const m of items) {
        const sender = m.overrideSenderName || m.sender?.displayName || '';
        if (sender !== lastSender) {
          if (lines.length > 0) lines.push('');
          if (sender) lines.push(`${sender}:`);
          lastSender = sender;
        }
        lines.push(m.text ?? '');
      }
      text = lines.join('\n');
    }
    void navigator.clipboard.writeText(text);
    exitSelection();
  }
  function onDeleteSelected() {
    const ids = orderedSelected;
    if (ids.length === 0) return;
    deleteTarget = { ids, canDeleteForAll: canDeleteSelectedForAll };
  }

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
      action?: string;
    }[] = [];
    actions.push({
      label: t('Reply'),
      icon: 'reply',
      action: 'reply',
      onSelect: () => setReplyTo(m.id),
    });
    if (m.text) {
      actions.push({
        label: t('Copy'),
        icon: 'copy',
        action: 'copy',
        onSelect: () => void navigator.clipboard.writeText(m.text),
      });
    }
    actions.push({
      label: t('Forward'),
      icon: 'forward',
      action: 'forward',
      onSelect: () => {
        forwardTargets = [m.id];
        forwardOpen = true;
      },
    });
    if (m.fromId === CONTACT_ID_SELF && m.viewType === 'Text') {
      actions.push({
        label: t('Edit'),
        icon: 'pencil',
        action: 'edit',
        onSelect: () => setEditing(m.id),
      });
    }
    actions.push({
      label: t('Delete'),
      icon: 'trash-2',
      danger: true,
      action: 'delete',
      onSelect: () => {
        // Core only accepts a recall for own messages that already left the
        // outbox. Anything else (incoming, draft, pending, failed) can only
        // be removed locally — match iOS by hiding the for-everyone option.
        const canDeleteForAll =
          m.fromId === CONTACT_ID_SELF &&
          (m.state === MSG_STATE.OutDelivered || m.state === MSG_STATE.OutMdnRcvd);
        deleteTarget = { ids: [m.id], canDeleteForAll };
      },
    });
    actions.push({
      label: t('Select More'),
      icon: 'check-square',
      action: 'select-more',
      onSelect: () => enterSelection(m.id),
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
    if (isSelecting) exitSelection();
  }

  function jumpTo(msgId: number) {
    // Quote-tap: caller may target a message outside the current loaded
    // window (chats grow long, quotes reach far back). `jumpToMessage`
    // paginates the gap before scrolling, and silently no-ops if the
    // target isn't in this chat at all (e.g. a reply-privately quote).
    void jumpToMessage(msgId);
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
  data-testid="chat-view"
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
                onShowReactors={(id) => (reactorsTarget = id)}
                selection={isSelecting
                  ? { selected: selectedIds.has(m.id), onToggle: () => toggleSelection(m.id) }
                  : null}
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

  {#if isSelecting}
    <div class="selection-bar" role="toolbar" aria-label={t('Selection actions')} data-testid="selection-bar" data-count={selectedCount}>
      <button class="cancel" onclick={exitSelection} data-testid="selection-bar__cancel">{t('Cancel')}</button>
      <span class="count" data-testid="selection-bar__count">
        {selectedCount === 1 ? t('1 selected') : t('{n} selected', { n: selectedCount })}
      </span>
      <div class="actions">
        <button
          class="action"
          disabled={selectedCount === 0}
          onclick={onForwardSelected}
          aria-label={t('Forward')}
          data-testid="selection-bar__forward"
        >
          <Icon name="forward" size={18} />
        </button>
        <button
          class="action"
          disabled={selectedCount === 0}
          onclick={onCopySelected}
          aria-label={t('Copy')}
          data-testid="selection-bar__copy"
        >
          <Icon name="copy" size={18} />
        </button>
        <button
          class="action danger"
          disabled={selectedCount === 0}
          onclick={onDeleteSelected}
          aria-label={t('Delete')}
          data-testid="selection-bar__delete"
        >
          <Icon name="trash-2" size={18} />
        </button>
      </div>
    </div>
  {:else}
    <Composer />
  {/if}
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
  count={deleteTarget?.ids.length ?? 1}
  onDeleteForMe={() => {
    if (deleteTarget) {
      void deleteMessages(deleteTarget.ids);
      if (isSelecting) exitSelection();
    }
  }}
  onDeleteForAll={() => {
    if (deleteTarget) {
      void deleteMessagesForAll(deleteTarget.ids);
      if (isSelecting) exitSelection();
    }
  }}
  onClose={() => (deleteTarget = null)}
/>

<ReactionDetailSheet
  open={reactorsTarget != null}
  messageId={reactorsTarget}
  onClose={() => (reactorsTarget = null)}
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
    /* Extra bottom padding so the newest bubble's reaction chips (which
       overlap ~16px below the bubble) clear the composer bar. */
    padding: var(--space-3) 0 var(--space-5);
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
  .selection-bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-elevated);
    border-top: 1px solid var(--color-border);
  }
  .selection-bar .cancel {
    background: transparent;
    color: var(--color-accent);
    font-size: var(--text-md);
    padding: 6px 10px;
    border-radius: var(--radius-sm);
  }
  .selection-bar .cancel:hover {
    background: var(--color-bg-hover);
  }
  .selection-bar .count {
    flex: 1;
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
    text-align: center;
  }
  .selection-bar .actions {
    display: flex;
    gap: var(--space-2);
  }
  .selection-bar .action {
    background: transparent;
    color: var(--color-fg);
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .selection-bar .action:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }
  .selection-bar .action:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .selection-bar .action.danger {
    color: var(--color-danger);
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
