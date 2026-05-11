<script lang="ts">
  import type { ChatListItem } from '../lib/state/chatlist.svelte';
  import { formatRelativeTimestamp } from '../lib/format/timestamp';
  import { MSG_STATE } from '../lib/state/chat.svelte';
  import Avatar from '../lib/Avatar.svelte';
  import Icon, { type IconName } from '../lib/Icon.svelte';

  type Props = {
    chat: ChatListItem;
    selected: boolean;
    narrow: boolean;
    onSelect: (id: number) => void;
    onContextMenu?: (chat: ChatListItem, x: number, y: number) => void;
  };

  let { chat, selected, narrow, onSelect, onContextMenu }: Props = $props();

  let displayName = $derived(chat.name.length > 0 ? chat.name : '(no name)');
  let timestamp = $derived(formatRelativeTimestamp(chat.lastUpdated));

  let preview = $derived(
    chat.summaryText1.length > 0
      ? `${chat.summaryText1}: ${chat.summaryText2}`
      : chat.summaryText2,
  );

  let title = $derived(narrow ? `${displayName}${preview ? ' — ' + preview : ''}` : '');

  let unreadLabel = $derived(chat.freshMessageCounter > 99 ? '99+' : String(chat.freshMessageCounter));

  // Mirror of iOS ChatListRow's stateGlyph — only shown for outgoing message
  // states. Incoming states (Undefined/InFresh/InNoticed/InSeen) return null.
  type Glyph = { icon: IconName; kind: 'pending' | 'delivered' | 'read' | 'failed' };
  let stateGlyph = $derived.by((): Glyph | null => {
    switch (chat.summaryStatus) {
      case MSG_STATE.OutPreparing:
      case MSG_STATE.OutPending:
        return { icon: 'loader', kind: 'pending' };
      case MSG_STATE.OutDelivered:
        return { icon: 'check', kind: 'delivered' };
      case MSG_STATE.OutMdnRcvd:
        return { icon: 'check-check', kind: 'read' };
      case MSG_STATE.OutFailed:
        return { icon: 'alert-circle', kind: 'failed' };
      default:
        return null;
    }
  });
</script>

<button
  class="row"
  class:narrow
  class:selected
  class:muted={chat.isMuted}
  onclick={() => onSelect(chat.id)}
  oncontextmenu={(e) => {
    if (!onContextMenu) return;
    e.preventDefault();
    onContextMenu(chat, e.clientX, e.clientY);
  }}
  {title}
  aria-label={displayName}
  aria-pressed={selected}
>
  <Avatar
    name={displayName}
    color={chat.color}
    imagePath={chat.avatarPath}
    size={40}
    seenRecently={chat.wasSeenRecently}
  />

  {#if !narrow}
    <span class="meta">
      <span class="row-top">
        <span class="name">
          {displayName}
          {#if chat.isMuted}
            <span class="mute" aria-label="muted" title="Muted"><Icon name="bell-off" size={12} /></span>
          {/if}
        </span>
        {#if timestamp}
          <span class="ts" class:accent={chat.freshMessageCounter > 0}>{timestamp}</span>
        {/if}
      </span>
      <span class="row-bottom">
        <span class="preview">{preview}</span>
        {#if stateGlyph}
          <span class="state {stateGlyph.kind}" aria-label={stateGlyph.kind}>
            <Icon name={stateGlyph.icon} size={12} stroke={2} />
          </span>
        {/if}
        {#if chat.freshMessageCounter > 0}
          <span class="unread">{unreadLabel}</span>
        {:else if chat.isPinned}
          <span class="pin" aria-label="pinned" title="Pinned"><Icon name="pin" size={12} /></span>
        {/if}
      </span>
    </span>
  {:else if chat.freshMessageCounter > 0}
    <span class="unread-dot"></span>
  {/if}
</button>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    text-align: left;
    transition: background 0.1s ease;
  }
  .row.narrow {
    justify-content: center;
    padding: var(--space-2);
  }
  .row:hover {
    background: var(--color-bg-hover);
  }
  .row.selected {
    background: var(--color-bg-selected);
  }
  .row.muted .name {
    color: var(--color-fg-secondary);
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
  }
  .row-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    min-height: 18px;
  }
  .name {
    font-weight: 600;
    font-size: var(--text-lg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .mute {
    font-size: 11px;
    opacity: 0.7;
  }
  .ts {
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }
  .ts.accent {
    color: var(--color-accent);
  }
  .preview {
    font-size: var(--text-md);
    color: var(--color-fg-secondary);
    flex: 1;
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .unread {
    flex: 0 0 auto;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-size: var(--text-xs);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pin {
    font-size: 12px;
    opacity: 0.7;
  }
  .state {
    display: inline-flex;
    align-items: center;
    color: var(--color-fg-tertiary);
    flex: 0 0 auto;
  }
  .state.read {
    color: var(--color-accent);
  }
  .state.failed {
    color: var(--color-danger);
  }
  .state.pending :global(svg) {
    animation: spin-row 1.2s linear infinite;
  }
  @keyframes spin-row {
    to {
      transform: rotate(360deg);
    }
  }
  .unread-dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-accent);
    border: 2px solid var(--color-bg-pane);
  }
</style>
