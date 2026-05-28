<script lang="ts">
  // Right-click context menu for a chat-list row — exposes the
  // pin / mute / archive triumvirate that used to live on the contact
  // page. Singleton at the ChatListPane level: rows fire `onContextMenu`
  // upward and the pane mounts one instance with the click coords.
  import type { ChatListItem } from '../lib/state/chatlist.svelte';
  import { canLeaveBeforeDelete } from '../lib/chatActions';
  import Icon from '../lib/Icon.svelte';
  import Popover from '../lib/Popover.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  // Mirrors deltachat-jsonrpc's `MuteDuration` (PascalCase tags — the enum
  // has no `rename_all` so variant names pass through verbatim).
  export type MuteDuration =
    | { kind: 'Forever' }
    | { kind: 'Until'; duration: number };

  type Props = {
    /** The chats the menu acts on. One for a normal row right-click, many
     *  when a multiselect set is active — labels derive from the aggregate. */
    chats: ChatListItem[];
    /** Page-coordinate anchor for the menu's top-left. */
    x: number;
    y: number;
    onClose: () => void;
    onTogglePin: () => void;
    onMute: (duration: MuteDuration) => void;
    onUnmute: () => void;
    onToggleArchive: () => void;
    onMarkUnread: () => void;
    onMarkRead: () => void;
    onDelete: () => void;
  };

  let {
    chats,
    x,
    y,
    onClose,
    onTogglePin,
    onMute,
    onUnmute,
    onToggleArchive,
    onMarkUnread,
    onMarkRead,
    onDelete,
  }: Props = $props();

  // Aggregate state across the target set drives every label. With a single
  // chat these collapse to that chat's own flags (so single-row behaviour is
  // unchanged); with many, an action only offers "un-X" when *every* selected
  // chat is already X — matching the reference's ChatContextMenu.
  let multi = $derived(chats.length > 1);
  let allPinned = $derived(chats.every((c) => c.isPinned));
  let allArchived = $derived(chats.every((c) => c.isArchived));
  let allMuted = $derived(chats.every((c) => c.isMuted));
  let anyUnread = $derived(chats.some((c) => c.freshMessageCounter > 0));

  // For groups/channels you're still a member of, "delete" upstream is a
  // leave + delete combo — surface that intent in the label so the user
  // isn't surprised that other members get a "<name> left" service message.
  let deleteLabel = $derived.by(() => {
    if (multi) return t('Delete {n} chats', { n: chats.length });
    const chat = chats[0]!;
    if (!canLeaveBeforeDelete(chat)) return t('Delete chat');
    return chat.chatType === 'InBroadcast' ? t('Leave channel') : t('Leave group');
  });

  // 'main' shows pin / mute / archive; 'mute' replaces with duration picks.
  let view = $state<'main' | 'mute'>('main');

  function fire(fn: () => void) {
    fn();
    onClose();
  }

  function pickMute(duration: MuteDuration) {
    onMute(duration);
    onClose();
  }

  // Durations the mobile app offers — `Until` takes a second-count, so we
  // stash the seconds inline and let the daemon do the SystemTime math.
  const HOUR = 3600;
  const DAY = 86400;
  const MUTE_OPTIONS: { label: () => string; duration: MuteDuration }[] = [
    { label: () => t('For 1 hour'), duration: { kind: 'Until', duration: HOUR } },
    { label: () => t('For 8 hours'), duration: { kind: 'Until', duration: 8 * HOUR } },
    { label: () => t('For 1 day'), duration: { kind: 'Until', duration: DAY } },
    { label: () => t('For 1 week'), duration: { kind: 'Until', duration: 7 * DAY } },
    { label: () => t('Forever'), duration: { kind: 'Forever' } },
  ];

  // Escape backs out of the mute submenu first, then dismisses the popover.
  function onEscape() {
    if (view === 'mute') view = 'main';
    else onClose();
  }
</script>

<Popover {x} {y} {onClose} {onEscape} data-testid="chat-row-menu">
  <div class="items">
  {#if view === 'main'}
    {#if anyUnread}
      <button role="menuitem" onclick={() => fire(onMarkRead)} data-testid="chat-row-menu-item" data-action="mark-read">
        <Icon name="check" size={14} />
        {t('Mark as Read')}
      </button>
    {:else}
      <button role="menuitem" onclick={() => fire(onMarkUnread)} data-testid="chat-row-menu-item" data-action="mark-unread">
        <Icon name="message-circle" size={14} />
        {t('Mark as Unread')}
      </button>
    {/if}
    <button role="menuitem" onclick={() => fire(onTogglePin)} data-testid="chat-row-menu-item" data-action={allPinned ? 'unpin' : 'pin'}>
      <Icon name="pin" size={14} />
      {allPinned ? t('Unpin') : t('Pin')}
    </button>
    {#if allMuted}
      <button role="menuitem" onclick={() => fire(onUnmute)} data-testid="chat-row-menu-item" data-action="unmute">
        <Icon name="bell" size={14} />
        {t('Unmute')}
      </button>
    {:else}
      <button role="menuitem" onclick={() => (view = 'mute')} data-testid="chat-row-menu-item" data-action="mute">
        <Icon name="bell-off" size={14} />
        {t('Mute…')}
      </button>
    {/if}
    <button role="menuitem" onclick={() => fire(onToggleArchive)} data-testid="chat-row-menu-item" data-action={allArchived ? 'unarchive' : 'archive'}>
      <Icon name="archive" size={14} />
      {allArchived ? t('Unarchive') : t('Archive')}
    </button>
    <div class="separator" role="separator"></div>
    <button class="danger" role="menuitem" onclick={() => fire(onDelete)} data-testid="chat-row-menu-item" data-action="delete">
      <Icon name="trash-2" size={14} />
      {deleteLabel}
    </button>
  {:else}
    <button class="sub-back" role="menuitem" onclick={() => (view = 'main')}>
      <Icon name="chevron-left" size={14} />
      {t('Mute')}
    </button>
    {#each MUTE_OPTIONS as opt (opt.label())}
      <button role="menuitem" onclick={() => pickMute(opt.duration)} data-testid="chat-row-mute-option">
        {opt.label()}
      </button>
    {/each}
  {/if}
  </div>
</Popover>

<style>
  .items {
    min-width: 180px;
    padding: 4px;
    display: flex;
    flex-direction: column;
  }
  .items button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    padding: 8px 10px;
    background: transparent;
    color: var(--color-fg);
    text-align: left;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }
  .items button:hover {
    background: var(--color-bg-hover);
  }
  .sub-back {
    color: var(--color-fg-secondary);
    font-weight: 600;
  }
  .items button.danger {
    color: var(--color-danger);
  }
  .separator {
    height: 1px;
    background: var(--color-border);
    margin: 4px 2px;
  }
</style>
