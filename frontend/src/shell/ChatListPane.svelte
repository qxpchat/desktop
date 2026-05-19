<script lang="ts">
  import {
    chatlist,
    setSearchQuery,
    setArchivedOnly,
    markChatUnread,
    markChatRead,
  } from '../lib/state/chatlist.svelte';
  import { paneMode, setPaneMode, backToInbox } from '../lib/state/paneMode.svelte';
  import {
    messageSearch,
    setSearchAccount,
    setMessageSearchQuery,
  } from '../lib/state/messageSearch.svelte';
  import { selectChat } from '../lib/state/selection.svelte';
  import { jumpToMessage } from '../lib/state/jump';
  import { accounts } from '../lib/state/accounts.svelte';
  import { profiles } from '../lib/state/profiles.svelte';
  import ChatListRow from './ChatListRow.svelte';
  import ChatRowMenu from './ChatRowMenu.svelte';
  import DeleteChatDialog from './DeleteChatDialog.svelte';
  import RailToggle from './RailToggle.svelte';
  import { rpc } from '../lib/rpc';
  import type { ChatListItem } from '../lib/state/chatlist.svelte';
  import { canLeaveBeforeDelete } from '../lib/chatActions';
  import Icon from '../lib/Icon.svelte';
  import SearchField from '../lib/SearchField.svelte';
  import { t } from '../lib/i18n/i18n.svelte';
  import { onShortcut } from '../lib/shortcuts';
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
    /** Pop the pane out of narrow (pfp-only) mode. Used by the new-chat
     *  pen-icon in narrow mode so the user can actually see the contact
     *  picker that opens. */
    onUncollapse?: () => void;
  };

  let {
    width,
    selectedChatId,
    onSelectChat,
    railOpen,
    onToggleRail,
    onUncollapse,
  }: Props = $props();

  // Narrow (pfp-only) whenever below the wide-mode minimum — pane2 width
  // only ever snaps to the narrow width or into the wide range, never
  // between, so any threshold in (NARROW_W, MIN_WIDE_W) works.
  let narrow = $derived(width < 240);

  // Sum unread across all *inactive* profiles — used as a roll-up badge on
  // the burger when the profile rail is collapsed, so the user notices a
  // pinging account they can't currently see.
  let otherUnread = $derived(
    profiles.list.reduce(
      (sum, p) => (p.id === accounts.selectedId ? sum : sum + p.freshCount),
      0,
    ),
  );
  let search = $state('');
  let searchField: { focus: () => void } | undefined = $state();

  // Cmd/Ctrl+K focuses the chat-list search input — handler matches
  // the global shortcut dispatched from `lib/shortcuts.ts`. Effect's
  // cleanup return handles unsubscribe.
  $effect(() => onShortcut('focus-search', () => {
    searchField?.focus();
  }));
  $effect(() => {
    setSearchQuery(search);
    setMessageSearchQuery(search);
  });
  $effect(() => {
    setSearchAccount(accounts.selectedId);
  });

  function jumpToHit(chatId: number, msgId: number) {
    void jumpToMessage(msgId, { chatId });
  }

  let hasResults = $derived(chatlist.ids.length > 0);
  let isFiltered = $derived(chatlist.query.trim().length > 0);

  function openCompose() {
    // Starting a new conversation needs the contact picker, which is
    // unusable at narrow (pfp-only) width — pop the pane out first.
    if (narrow) onUncollapse?.();
    setPaneMode({ kind: 'compose' });
  }

  // Context-menu state: one menu per pane, populated on row right-click.
  // Actions hit the core directly and mutate the existing chatlist state
  // via its event-driven refresh (deltachat-core emits ChatModified after
  // each call, which the chatlist runes pick up).
  let menu = $state<{ chat: ChatListItem; x: number; y: number } | null>(null);

  async function togglePin(chat: ChatListItem) {
    if (accounts.selectedId == null) return;
    // ChatVisibility variants are PascalCase on the wire — the enum has no
    // `rename_all`, so the tag passes through verbatim.
    const vis = chat.isPinned ? 'Normal' : 'Pinned';
    try {
      await rpc.call('set_chat_visibility', [accounts.selectedId, chat.id, vis]);
    } catch {
      /* core surfaces failure via its own event/error path */
    }
  }
  async function setMute(chat: ChatListItem, dur: unknown) {
    if (accounts.selectedId == null) return;
    try {
      await rpc.call('set_chat_mute_duration', [accounts.selectedId, chat.id, dur]);
    } catch (err) {
      console.warn('set_chat_mute_duration failed', err);
    }
  }
  // PascalCase variant tags — see ChatRowMenu's `MuteDuration` type.
  const muteChat = (chat: ChatListItem, dur: { kind: 'Forever' } | { kind: 'Until'; duration: number }) =>
    setMute(chat, dur);
  const unmuteChat = (chat: ChatListItem) => setMute(chat, { kind: 'NotMuted' });
  async function toggleArchive(chat: ChatListItem) {
    if (accounts.selectedId == null) return;
    const vis = chat.isArchived ? 'Normal' : 'Archived';
    try {
      await rpc.call('set_chat_visibility', [accounts.selectedId, chat.id, vis]);
    } catch {
      /* same */
    }
  }

  // Two-step delete: the context menu fires `requestDelete`, which stashes
  // the target chat and unmounts the menu; the modal then renders against
  // that stash. Going through a confirmation modal (rather than native
  // `confirm()`) keeps the UX consistent inside the Tauri webview.
  let pendingDelete = $state<ChatListItem | null>(null);

  function requestDelete(chat: ChatListItem) {
    pendingDelete = chat;
  }

  async function confirmDelete(chat: ChatListItem) {
    if (accounts.selectedId == null) return;
    const accountId = accounts.selectedId;
    // Drop the selection first — the chat view subscribes to messages on
    // the deleted id, so leaving it selected races with `delete_chat` and
    // flashes a "missing chat" error before chatlist refresh kicks in.
    if (selectedChatId === chat.id) selectChat(null);
    try {
      if (canLeaveBeforeDelete(chat)) {
        await rpc.call('leave_group', [accountId, chat.id]);
      }
      await rpc.call('delete_chat', [accountId, chat.id]);
    } catch (err) {
      console.warn('delete_chat failed', err);
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

<aside class="pane" style:width="{width}px" aria-label={t('Chat list')} data-testid="chat-list">
  <div class="titlebar-gutter" data-tauri-drag-region></div>
  {#if paneMode.mode.kind === 'inbox' || paneMode.mode.kind === 'archive'}
    {@const archive = paneMode.mode.kind === 'archive'}
    <header class="header" class:narrow>
      {#if archive}
        <button class="expand" aria-label={t('Back to inbox')} onclick={exitArchive} data-testid="chat-list-archive-back">
          <Icon name="chevron-left" size={18} />
        </button>
        {#if !narrow}
          <span class="title">{t('Archived')}</span>
        {/if}
      {:else}
        {#if !railOpen}
          <div class="toggle-slot">
            <RailToggle open={false} onToggle={onToggleRail} unread={otherUnread} />
          </div>
        {/if}
        {#if !narrow}
          <SearchField
            class="search"
            placeholder={t('Search chats…')}
            aria-label={t('Search chats')}
            bind:value={search}
            bind:this={searchField}
            data-testid="chat-list-search"
          />
        {/if}
        <button
          class="compose"
          title={t('New conversation')}
          aria-label={t('New conversation')}
          onclick={openCompose}
          data-testid="compose-button"
        >
          <Icon name="pencil" size={16} />
        </button>
      {/if}
    </header>

    <ul class="list">
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
          {isFiltered ? t('No conversations match.') : t('No conversations yet.')}
        </li>
      {/if}

      {#if !archive && chatlist.hasArchive && !narrow}
        <li>
          <button class="archive-row" onclick={openArchive} data-testid="chat-list-archive-link">
            <span class="archive-icon" aria-hidden="true"><Icon name="archive" size={20} /></span>
            <span>{t('Archived chats')}</span>
          </button>
        </li>
      {/if}

      {#if isFiltered && messageSearch.hits.length > 0}
        <li class="section-header" data-testid="chat-list-search__messages-header">{t('Messages')}</li>
        {#each messageSearch.hits.slice(0, 25) as h (h.id)}
          <li>
            <button class="hit" onclick={() => jumpToHit(h.chatId, h.id)} data-testid="chat-list-search__hit" data-msg-id={h.id}>
              <span class="hit-text">{h.text || t('(no text)')}</span>
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
    onMute={(dur) => void muteChat(menu!.chat, dur)}
    onUnmute={() => void unmuteChat(menu!.chat)}
    onToggleArchive={() => void toggleArchive(menu!.chat)}
    onMarkUnread={() => {
      // If the chat is currently open, ChatView's `markNoticed` would
      // immediately undo the markfresh on the next window focus. Drop the
      // selection first — that unmounts ChatView, whose cleanup clears
      // `chat.active`, so no later event can re-notice the chat. Same
      // approach as references/deltachat-desktop/.../ChatContextMenu.tsx.
      if (selectedChatId === menu!.chat.id) selectChat(null);
      void markChatUnread(menu!.chat.id);
    }}
    onMarkRead={() => void markChatRead(menu!.chat.id)}
    onDelete={() => requestDelete(menu!.chat)}
  />
{/if}

<DeleteChatDialog
  open={pendingDelete !== null}
  chatName={pendingDelete?.name ?? ''}
  leaveBeforeDelete={pendingDelete ? canLeaveBeforeDelete(pendingDelete) : false}
  onConfirm={() => pendingDelete && void confirmDelete(pendingDelete)}
  onClose={() => (pendingDelete = null)}
/>

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
    min-height: var(--pane-header-min-h);
  }
  .header.narrow {
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    padding: var(--space-2);
    /* Cancel the row-mode min-height so the column stack hugs the buttons. */
    min-height: 0;
  }
  /* Wide header: the wrapper collapses away so the toggle sits inline in
     the row. Narrow header: it becomes a full-height slot so the toggle
     keeps the same Y as in the wide header and the rail. */
  .toggle-slot {
    display: contents;
  }
  .header.narrow .toggle-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: var(--pane-header-min-h);
    /* Cancel the column's top padding so the slot sits flush below the
       title-bar gutter — puts the toggle's centre at the same Y again. */
    margin-top: calc(-1 * var(--space-2));
  }
  .expand {
    position: relative;
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
  .expand:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .header :global(.search) {
    flex: 1;
    min-width: 0;
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
