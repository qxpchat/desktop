<script lang="ts">
  import { untrack } from 'svelte';
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

  // -- Multiselect ---------------------------------------------------------
  // Desktop-style selection: Ctrl/Cmd+click toggles a row, Shift+click
  // extends a range from the last anchor. A plain click collapses the
  // selection and opens the chat. Batch actions act on the whole set via the
  // same context menu (right-click a selected row) the single-row case uses.
  let selected = $state<Set<number>>(new Set());
  let anchorId: number | null = null;

  function clearSelection() {
    if (selected.size > 0) selected = new Set();
    anchorId = null;
  }

  // Reset the selection whenever the underlying list identity changes —
  // account switch or entering/leaving search — so stale ids can't linger.
  // `untrack` the clear: `clearSelection` reads `selected.size`, which would
  // otherwise make this effect depend on `selected` and wipe the set on
  // every Ctrl+click.
  $effect(() => {
    void accounts.selectedId;
    void chatlist.query;
    untrack(() => clearSelection());
  });

  function handleSelect(id: number, mods: { ctrl: boolean; shift: boolean }) {
    // Beginning a multiselect from the currently-open chat: fold that chat
    // into the set first, so it shows the same selected styling as the rows
    // added next. Matches the reference, where the active chat is always part
    // of the selection — without this the open row stays plain while the new
    // picks get the accent bar.
    if (
      selected.size === 0 &&
      (mods.ctrl || mods.shift) &&
      selectedChatId != null &&
      selectedChatId !== id
    ) {
      selected = new Set([selectedChatId]);
      if (anchorId == null) anchorId = selectedChatId;
    }
    if (mods.shift && anchorId != null) {
      const ids = chatlist.ids;
      const a = ids.indexOf(anchorId);
      const b = ids.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const next = new Set(selected);
        for (let i = lo; i <= hi; i++) next.add(ids[i]!);
        selected = next;
      }
      return;
    }
    if (mods.ctrl) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selected = next;
      anchorId = id;
      return;
    }
    // Plain click — collapse any selection and open the chat. Set the anchor
    // to this row so a following Shift+click extends a range from here (a
    // bare Shift+click with no prior Ctrl-click would otherwise have no
    // anchor and just open the chat).
    clearSelection();
    anchorId = id;
    onSelectChat(id);
  }

  // Context-menu state: one menu per pane, populated on row right-click.
  // `targets` is the selection when the right-clicked row is part of it,
  // else just that row. Actions hit the core directly and mutate the
  // existing chatlist state via its event-driven refresh (deltachat-core
  // emits ChatModified after each call, which the chatlist runes pick up).
  let menu = $state<{ targets: ChatListItem[]; x: number; y: number } | null>(null);

  function selectedItems(): ChatListItem[] {
    return chatlist.ids
      .filter((id) => selected.has(id))
      .map((id) => chatlist.items.get(id))
      .filter((c): c is ChatListItem => c != null);
  }

  function openMenu(chat: ChatListItem, x: number, y: number) {
    const targets = selected.has(chat.id) && selected.size > 0 ? selectedItems() : [chat];
    menu = { targets, x, y };
  }

  async function setVisibility(chats: ChatListItem[], vis: 'Normal' | 'Pinned' | 'Archived') {
    if (accounts.selectedId == null) return;
    const accountId = accounts.selectedId;
    for (const c of chats) {
      try {
        await rpc.call('set_chat_visibility', [accountId, c.id, vis]);
      } catch {
        /* core surfaces failure via its own event/error path */
      }
    }
  }
  // ChatVisibility variants are PascalCase on the wire — the enum has no
  // `rename_all`, so the tag passes through verbatim. "Toggle" is really
  // "set the whole set to the opposite of the aggregate", matching the
  // menu's label logic (un-X only when every target is already X).
  const togglePin = (chats: ChatListItem[]) =>
    setVisibility(chats, chats.every((c) => c.isPinned) ? 'Normal' : 'Pinned');
  const toggleArchive = (chats: ChatListItem[]) =>
    setVisibility(chats, chats.every((c) => c.isArchived) ? 'Normal' : 'Archived');

  async function setMute(chats: ChatListItem[], dur: unknown) {
    if (accounts.selectedId == null) return;
    const accountId = accounts.selectedId;
    for (const c of chats) {
      try {
        await rpc.call('set_chat_mute_duration', [accountId, c.id, dur]);
      } catch (err) {
        console.warn('set_chat_mute_duration failed', err);
      }
    }
  }
  // PascalCase variant tags — see ChatRowMenu's `MuteDuration` type.
  const muteChats = (
    chats: ChatListItem[],
    dur: { kind: 'Forever' } | { kind: 'Until'; duration: number },
  ) => setMute(chats, dur);
  const unmuteChats = (chats: ChatListItem[]) => setMute(chats, { kind: 'NotMuted' });

  function markReadAll(chats: ChatListItem[]) {
    for (const c of chats) void markChatRead(c.id);
  }
  function markUnreadAll(chats: ChatListItem[]) {
    // If a target chat is currently open, ChatView's `markNoticed` would undo
    // the markfresh on next focus. Drop the selection first (unmounts
    // ChatView). Same approach as the reference's ChatContextMenu.
    if (selectedChatId != null && chats.some((c) => c.id === selectedChatId)) {
      selectChat(null);
    }
    for (const c of chats) void markChatUnread(c.id);
  }

  // Two-step delete: the context menu fires `requestDelete`, which stashes
  // the target chats and unmounts the menu; the modal then renders against
  // that stash. Going through a confirmation modal (rather than native
  // `confirm()`) keeps the UX consistent inside the Tauri webview.
  let pendingDelete = $state<ChatListItem[] | null>(null);

  function requestDelete(chats: ChatListItem[]) {
    pendingDelete = chats;
  }

  async function confirmDelete(chats: ChatListItem[]) {
    if (accounts.selectedId == null) return;
    const accountId = accounts.selectedId;
    // Drop the selection first — the chat view subscribes to messages on
    // the deleted id, so leaving it selected races with `delete_chat` and
    // flashes a "missing chat" error before chatlist refresh kicks in.
    if (selectedChatId != null && chats.some((c) => c.id === selectedChatId)) {
      selectChat(null);
    }
    for (const c of chats) {
      try {
        if (canLeaveBeforeDelete(c)) {
          await rpc.call('leave_group', [accountId, c.id]);
        }
        await rpc.call('delete_chat', [accountId, c.id]);
      } catch (err) {
        console.warn('delete_chat failed', err);
      }
    }
    clearSelection();
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

    {#if selected.size > 0 && !narrow}
      <div class="selection-bar" data-testid="chat-list-selection-bar">
        <span class="sel-count" data-testid="chat-list-selection-bar__count">{selected.size}</span>
        <span class="sel-label">{t('selected')}</span>
        <span class="sel-spacer"></span>
        <span class="sel-hint">{t('Right-click for actions')}</span>
        <button
          class="sel-clear"
          onclick={clearSelection}
          data-testid="chat-list-selection-bar__clear"
        >{t('Clear')}</button>
      </div>
    {/if}

    <ul class="list">
      {#each chatlist.ids as id (id)}
        {@const item = chatlist.items.get(id)}
        {#if item}
          <li>
            <ChatListRow
              chat={item}
              selected={id === selectedChatId}
              {narrow}
              archiveView={archive}
              multiSelected={selected.has(id)}
              onSelect={handleSelect}
              onContextMenu={openMenu}
            />
          </li>
        {/if}
      {/each}

      {#if !hasResults && !chatlist.loading}
        <li class="empty" data-testid="chat-list-empty">
          {#if isFiltered}
            {t('No conversations match.')}
          {:else if archive}
            <!-- Empty-archive hint is distinct from empty-inbox: it
                 tells the user nothing has been archived yet, and that
                 archive is the place to find chats they actively hide. -->
            {t('No archived conversations. Long-press or right-click a chat in the inbox to archive it.')}
          {:else}
            {t('No conversations yet.')}
          {/if}
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
    chats={menu.targets}
    x={menu.x}
    y={menu.y}
    onClose={() => (menu = null)}
    onTogglePin={() => void togglePin(menu!.targets).then(clearSelection)}
    onMute={(dur) => void muteChats(menu!.targets, dur).then(clearSelection)}
    onUnmute={() => void unmuteChats(menu!.targets).then(clearSelection)}
    onToggleArchive={() => void toggleArchive(menu!.targets).then(clearSelection)}
    onMarkUnread={() => {
      markUnreadAll(menu!.targets);
      clearSelection();
    }}
    onMarkRead={() => {
      markReadAll(menu!.targets);
      clearSelection();
    }}
    onDelete={() => requestDelete(menu!.targets)}
  />
{/if}

<DeleteChatDialog
  open={pendingDelete !== null}
  chatName={pendingDelete?.[0]?.name ?? ''}
  count={pendingDelete?.length ?? 1}
  leaveBeforeDelete={pendingDelete?.length === 1 ? canLeaveBeforeDelete(pendingDelete[0]!) : false}
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
  /* Wide header: an 80px slot, flush to the pane edge, centring the toggle
     exactly as NavTabs' .rail-header does — identical L/R padding around the
     toggle on both panes, so it keeps its X across rail open/close. The
     search field (flex: 1) absorbs whatever width is left. Narrow header: a
     full-width slot keeping the same Y as the wide header. */
  .toggle-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--pane1-width);
    margin-left: calc(-1 * var(--space-3));
    /* The slot spans the full rail width only to centre the toggle. Pull
       its dead right half back into the row so the search field starts
       right after the toggle, not after the whole 80px slot. 28px = toggle
       button width. */
    margin-right: calc(-1 * (var(--pane1-width) - 28px) / 2);
  }
  .header.narrow .toggle-slot {
    width: 100%;
    margin-left: 0;
    margin-right: 0;
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
  .selection-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-accent-soft);
    border-bottom: 1px solid var(--color-border);
    flex: 0 0 auto;
    font-size: var(--text-sm);
  }
  .sel-count {
    font-weight: 700;
    color: var(--color-accent);
    font-variant-numeric: tabular-nums;
  }
  .sel-label {
    color: var(--color-fg-secondary);
  }
  .sel-spacer {
    flex: 1;
  }
  .sel-hint {
    color: var(--color-fg-tertiary);
    font-size: var(--text-xs);
  }
  .sel-clear {
    color: var(--color-accent);
    font-weight: 600;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }
  .sel-clear:hover {
    background: var(--color-bg-hover);
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
