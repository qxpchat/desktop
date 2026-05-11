<script lang="ts">
  // Right-click context menu for a chat-list row — exposes the
  // pin / mute / archive triumvirate that used to live on the contact
  // page. Singleton at the ChatListPane level: rows fire `onContextMenu`
  // upward and the pane mounts one instance with the click coords.
  import type { ChatListItem } from '../lib/state/chatlist.svelte';
  import Icon from '../lib/Icon.svelte';

  type Props = {
    chat: ChatListItem;
    /** Page-coordinate anchor for the menu's top-left. */
    x: number;
    y: number;
    onClose: () => void;
    onTogglePin: () => void;
    onToggleMute: () => void;
    onToggleArchive: () => void;
  };

  let { chat, x, y, onClose, onTogglePin, onToggleMute, onToggleArchive }: Props = $props();

  let menu: HTMLDivElement | undefined = $state();
  // svelte-ignore state_referenced_locally
  let style = $state(`top: ${y}px; left: ${x}px;`);

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

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- Invisible backdrop catches outside-clicks. Keyboard-dismissable via
     window Escape above; the backdrop itself doesn't need its own keydown. -->
<button class="backdrop" aria-label="Close menu" onclick={onClose}></button>

<div bind:this={menu} class="menu" role="menu" {style}>
  <button role="menuitem" onclick={() => fire(onTogglePin)}>
    <Icon name="pin" size={14} />
    {chat.isPinned ? 'Unpin' : 'Pin'}
  </button>
  <button role="menuitem" onclick={() => fire(onToggleMute)}>
    <Icon name="bell-off" size={14} />
    {chat.isMuted ? 'Unmute' : 'Mute'}
  </button>
  <button role="menuitem" onclick={() => fire(onToggleArchive)}>
    <Icon name="archive" size={14} />
    {chat.isArchived ? 'Unarchive' : 'Archive'}
  </button>
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
</style>
