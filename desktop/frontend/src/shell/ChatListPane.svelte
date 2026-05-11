<script lang="ts">
  import {
    chatlist,
    setSearchQuery,
    setArchivedOnly,
  } from '../lib/state/chatlist.svelte';
  import { paneMode, setPaneMode, backToInbox } from '../lib/state/paneMode.svelte';
  import { mainRoute } from '../lib/state/mainRoute.svelte';
  import {
    messageSearch,
    setSearchAccount,
    setMessageSearchQuery,
  } from '../lib/state/messageSearch.svelte';
  import { selectChat } from '../lib/state/selection.svelte';
  import { flashMessage } from '../lib/state/chat.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import ChatListRow from './ChatListRow.svelte';
  import ChatRowMenu from './ChatRowMenu.svelte';
  import { rpc } from '../lib/rpc';
  import type { ChatListItem } from '../lib/state/chatlist.svelte';
  import Icon from '../lib/Icon.svelte';
  import ComposePane from '../compose/ComposePane.svelte';
  import ChooseMembers from '../compose/ChooseMembers.svelte';
  import GroupMetadata from '../compose/GroupMetadata.svelte';

  type Props = {
    width: number;
    selectedChatId: number | null;
    onSelectChat: (id: number) => void;
    /** True when the profile rail (NavTabs) is currently visible. */
    railOpen: boolean;
    onToggleRail: () => void;
  };

  let { width, selectedChatId, onSelectChat, railOpen, onToggleRail }: Props = $props();

  let narrow = $derived(width < 80);

  // Burger is disabled when the user is in a full-screen route (Settings
  // / QR / etc.) — opening the rail there overlays nothing useful and
  // the toggle is ambiguous with the route's own back-navigation.
  let burgerDisabled = $derived.by(() => {
    const k = mainRoute.route.kind;
    return k === 'settings' || k === 'qrShow' || k === 'qrScan' || k === 'profileEditor';
  });

  let search = $state('');
  $effect(() => {
    setSearchQuery(search);
    setMessageSearchQuery(search);
  });
  $effect(() => {
    setSearchAccount(accounts.selectedId);
  });

  function jumpToHit(chatId: number, msgId: number) {
    selectChat(chatId);
    queueMicrotask(() => {
      flashMessage(msgId);
      const el = document.getElementById(`msg-${msgId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  let hasResults = $derived(chatlist.ids.length > 0);
  let isFiltered = $derived(chatlist.query.trim().length > 0);

  function openCompose() {
    setPaneMode({ kind: 'compose' });
  }

  // Context-menu state: one menu per pane, populated on row right-click.
  // Actions hit the core directly and mutate the existing chatlist state
  // via its event-driven refresh (deltachat-core emits ChatModified after
  // each call, which the chatlist runes pick up).
  let menu = $state<{ chat: ChatListItem; x: number; y: number } | null>(null);

  async function togglePin(chat: ChatListItem) {
    if (accounts.selectedId == null) return;
    const vis = chat.isPinned ? 'normal' : 'pinned';
    try {
      await rpc.call('set_chat_visibility', [accounts.selectedId, chat.id, vis]);
    } catch {
      /* core surfaces failure via its own event/error path */
    }
  }
  async function toggleMute(chat: ChatListItem) {
    if (accounts.selectedId == null) return;
    const dur = chat.isMuted ? { kind: 'notMuted' } : { kind: 'forever' };
    try {
      await rpc.call('set_chat_mute_duration', [accounts.selectedId, chat.id, dur]);
    } catch {
      /* same */
    }
  }
  async function toggleArchive(chat: ChatListItem) {
    if (accounts.selectedId == null) return;
    const vis = chat.isArchived ? 'normal' : 'archived';
    try {
      await rpc.call('set_chat_visibility', [accounts.selectedId, chat.id, vis]);
    } catch {
      /* same */
    }
  }

  function openArchive() {
    setPaneMode({ kind: 'archive' });
    setArchivedOnly(true);
  }
  function exitArchive() {
    setArchivedOnly(false);
    backToInbox();
  }
</script>

<aside class="pane" style:width="{width}px" aria-label="Chat list">
  <div class="titlebar-gutter" data-tauri-drag-region></div>
  {#if paneMode.mode.kind === 'inbox' || paneMode.mode.kind === 'archive'}
    {@const archive = paneMode.mode.kind === 'archive'}
    <header class="header" class:narrow>
      {#if archive}
        <button class="expand" aria-label="Back to inbox" onclick={exitArchive}>
          <Icon name="chevron-left" size={18} />
        </button>
        {#if !narrow}
          <span class="title">Archived</span>
        {/if}
      {:else}
        <button
          class="burger"
          class:active={railOpen}
          title={railOpen ? 'Hide profiles' : 'Show profiles'}
          aria-label="Toggle profile rail"
          aria-pressed={railOpen}
          disabled={burgerDisabled}
          onclick={onToggleRail}
        >
          <Icon name="menu" size={18} />
        </button>
        {#if !narrow}
          <input
            class="search"
            type="search"
            placeholder="Search chats…"
            aria-label="Search chats"
            bind:value={search}
          />
          <button
            class="compose"
            title="New conversation"
            aria-label="New conversation"
            onclick={openCompose}
          >
            <Icon name="pencil" size={16} />
          </button>
        {/if}
      {/if}
    </header>

    <ul class="list">
      {#if !archive && chatlist.hasArchive && !narrow}
        <li>
          <button class="archive-row" onclick={openArchive}>
            <span class="archive-icon" aria-hidden="true"><Icon name="archive" size={20} /></span>
            <span>Archived chats</span>
          </button>
        </li>
      {/if}
      {#each chatlist.ids as id (id)}
        {@const item = chatlist.items.get(id)}
        {#if item}
          <li>
            <ChatListRow
              chat={item}
              selected={id === selectedChatId}
              {narrow}
              onSelect={onSelectChat}
              onContextMenu={(c, x, y) => (menu = { chat: c, x, y })}
            />
          </li>
        {/if}
      {/each}

      {#if !hasResults && !chatlist.loading}
        <li class="empty">
          {isFiltered ? 'No conversations match.' : 'No conversations yet.'}
        </li>
      {/if}

      {#if isFiltered && messageSearch.hits.length > 0}
        <li class="section-header">Messages</li>
        {#each messageSearch.hits.slice(0, 25) as h (h.id)}
          <li>
            <button class="hit" onclick={() => jumpToHit(h.chatId, h.id)}>
              <span class="hit-text">{h.text || '(no text)'}</span>
              {#if h.sender}
                <span class="hit-sender">{h.sender}</span>
              {/if}
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  {:else if paneMode.mode.kind === 'compose'}
    <ComposePane {onSelectChat} />
  {:else if paneMode.mode.kind === 'chooseMembers'}
    <ChooseMembers mode={paneMode.mode} />
  {:else if paneMode.mode.kind === 'setGroupMetadata'}
    <GroupMetadata mode={paneMode.mode} {onSelectChat} />
  {/if}
</aside>

{#if menu}
  <ChatRowMenu
    chat={menu.chat}
    x={menu.x}
    y={menu.y}
    onClose={() => (menu = null)}
    onTogglePin={() => void togglePin(menu!.chat)}
    onToggleMute={() => void toggleMute(menu!.chat)}
    onToggleArchive={() => void toggleArchive(menu!.chat)}
  />
{/if}

<style>
  .pane {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-pane);
    border-right: 1px solid var(--color-border);
    overflow: hidden;
    min-width: var(--pane2-min);
    flex: 0 0 auto;
  }
  .titlebar-gutter {
    flex: 0 0 auto;
    height: var(--titlebar-gutter);
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    flex: 0 0 auto;
    min-height: 56px;
  }
  .header.narrow {
    justify-content: center;
    padding: var(--space-2);
  }
  .expand,
  .burger {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-fg-secondary);
    flex: 0 0 auto;
    font-size: 18px;
    line-height: 1;
    justify-content: center;
    transition: background 0.1s ease, color 0.1s ease;
  }
  .expand:hover,
  .burger:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .burger.active {
    background: var(--color-bg-hover);
    color: var(--color-accent);
  }
  .burger:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .search {
    flex: 1;
    height: 32px;
    border-radius: var(--radius-md);
    background: var(--color-bg-hover);
    padding: 0 var(--space-3);
    border: 1px solid transparent;
    font-size: var(--text-md);
    min-width: 0;
  }
  .search:focus {
    border-color: var(--color-accent);
    background: var(--color-bg-pane);
  }
  .compose {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    color: var(--color-accent);
    flex: 0 0 auto;
    font-size: 16px;
    line-height: 1;
    justify-content: center;
  }
  .compose:hover {
    background: var(--color-bg-hover);
  }
  .title {
    font-weight: 600;
    font-size: var(--text-md);
  }
  .archive-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    text-align: left;
    background: transparent;
    color: var(--color-fg);
  }
  .archive-row:hover {
    background: var(--color-bg-hover);
  }
  .archive-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--color-bg-hover);
    color: var(--color-fg-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
  }
  .list {
    overflow-y: auto;
    flex: 1;
    /* Hide the native scrollbar but keep scroll behaviour. */
    scrollbar-width: none;
  }
  .list::-webkit-scrollbar {
    display: none;
  }
  .empty {
    padding: var(--space-5) var(--space-4);
    color: var(--color-fg-tertiary);
    text-align: center;
    font-size: var(--text-sm);
  }
  .section-header {
    padding: var(--space-3) var(--space-3) var(--space-2);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-fg-tertiary);
    border-top: 1px solid var(--color-border);
    margin-top: var(--space-2);
  }
  .hit {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    text-align: left;
    background: transparent;
  }
  .hit:hover {
    background: var(--color-bg-hover);
  }
  .hit-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hit-sender {
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
  }
</style>
