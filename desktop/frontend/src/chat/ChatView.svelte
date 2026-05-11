<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import {
    chat,
    setActiveChat,
    markNoticed,
    toggleReaction,
    deleteMessages,
    forwardMessages,
    setReplyTo,
    setEditing,
    flashMessage,
    CONTACT_ID_SELF,
    type Message,
  } from '../lib/state/chat.svelte';
  import { chatlist } from '../lib/state/chatlist.svelte';
  import MessageBubble from './MessageBubble.svelte';
  import InfoMessage from './InfoMessage.svelte';
  import Composer from './Composer.svelte';
  import ScrollToLatest from './ScrollToLatest.svelte';
  import ContextMenu from './ContextMenu.svelte';
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

  async function scrollToBottom(): Promise<void> {
    if (!scroller) return;
    await tick();
    scroller.scrollTop = scroller.scrollHeight;
    atBottom = true;
    newSinceScroll = 0;
  }

  function onScroll() {
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const next = distance < 64;
    if (next !== atBottom) {
      atBottom = next;
      if (atBottom) newSinceScroll = 0;
    }
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
      label: 'Reply',
      icon: 'reply',
      onSelect: () => setReplyTo(m.id),
    });
    if (m.text) {
      actions.push({
        label: 'Copy',
        icon: 'copy',
        onSelect: () => void navigator.clipboard.writeText(m.text),
      });
    }
    actions.push({
      label: 'Forward',
      icon: 'forward',
      onSelect: () => {
        forwardTargets = [m.id];
        forwardOpen = true;
      },
    });
    if (m.fromId === CONTACT_ID_SELF && m.viewType === 'Text') {
      actions.push({
        label: 'Edit',
        icon: 'pencil',
        onSelect: () => setEditing(m.id),
      });
    }
    actions.push({
      label: 'Delete',
      icon: 'trash-2',
      danger: true,
      onSelect: () => {
        if (confirm('Delete this message? Other recipients will keep their copy.')) {
          void deleteMessages([m.id]);
        }
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
    flashMessage(msgId);
    queueMicrotask(() => {
      const el = document.getElementById(`msg-${msgId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
</script>

<div class="chat-view">
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
      <div class="empty muted">Loading messages…</div>
    {:else if chat.ids.length === 0}
      <div class="empty">
        <p class="muted">No messages yet — say hi!</p>
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
          <div id="msg-{id}">
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

<style>
  .chat-view {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
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
