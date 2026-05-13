<script lang="ts">
  // Right-click context menu for a chat-list row — exposes the
  // pin / mute / archive triumvirate that used to live on the contact
  // page. Singleton at the ChatListPane level: rows fire `onContextMenu`
  // upward and the pane mounts one instance with the click coords.
  import type { ChatListItem } from '../lib/state/chatlist.svelte';
  import { canLeaveBeforeDelete } from '../lib/chatActions';
  import Icon from '../lib/Icon.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  // Mirrors deltachat-jsonrpc's `MuteDuration` (PascalCase tags — the enum
  // has no `rename_all` so variant names pass through verbatim).
  export type MuteDuration =
    | { kind: 'Forever' }
    | { kind: 'Until'; duration: number };

  type Props = {
    chat: ChatListItem;
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
    chat,
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

  // For groups/channels you're still a member of, "delete" upstream is a
  // leave + delete combo — surface that intent in the label so the user
  // isn't surprised that other members get a "<name> left" service message.
  let deleteLabel = $derived.by(() => {
    if (!canLeaveBeforeDelete(chat)) return t('Delete chat');
    return chat.chatType === 'InBroadcast' ? t('Leave channel') : t('Leave group');
  });

  let menu: HTMLDivElement | undefined = $state();
  // svelte-ignore state_referenced_locally
  let style = $state(`top: ${y}px; left: ${x}px;`);
  // 'main' shows pin / mute / archive; 'mute' replaces with duration picks.
  let view = $state<'main' | 'mute'>('main');

  // Clamp into viewport once the menu's rect is known.
  $effect(() => {
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
    style = `top: ${Math.max(8, top)}px; left: ${Math.max(8, left)}px;`;
  });

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

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (view === 'mute') view = 'main';
      else onClose();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- Invisible backdrop catches outside-clicks. Keyboard-dismissable via
     window Escape above; the backdrop itself doesn't need its own keydown. -->
<button class="backdrop" aria-label={t('Close menu')} onclick={onClose}></button>

<div bind:this={menu} class="menu" role="menu" {style} data-testid="chat-row-menu">
  {#if view === 'main'}
    {#if chat.freshMessageCounter > 0}
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
    <button role="menuitem" onclick={() => fire(onTogglePin)} data-testid="chat-row-menu-item" data-action={chat.isPinned ? 'unpin' : 'pin'}>
      <Icon name="pin" size={14} />
      {chat.isPinned ? t('Unpin') : t('Pin')}
    </button>
    {#if chat.isMuted}
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
    <button role="menuitem" onclick={() => fire(onToggleArchive)} data-testid="chat-row-menu-item" data-action={chat.isArchived ? 'unarchive' : 'archive'}>
      <Icon name="archive" size={14} />
      {chat.isArchived ? t('Unarchive') : t('Archive')}
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

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: 0;
    z-index: var(--z-overlay);
  }
  .menu {
    position: fixed;
    z-index: calc(var(--z-overlay) + 1);
    min-width: 180px;
    padding: 4px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px var(--color-shadow);
    display: flex;
    flex-direction: column;
  }
  .menu button {
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
  .menu button:hover {
    background: var(--color-bg-hover);
  }
  .sub-back {
    color: var(--color-fg-secondary);
    font-weight: 600;
  }
  .menu button.danger {
    color: var(--color-danger);
  }
  .separator {
    height: 1px;
    background: var(--color-border);
    margin: 4px 2px;
  }
</style>
