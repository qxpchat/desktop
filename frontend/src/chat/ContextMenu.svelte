<script lang="ts">
  // Right-click context menu anchored to a clicked message bubble. Shows the
  // quick-reaction row + a list of actions. The reaction row is the primary
  // surface; "more" opens the emoji picker.

  import { quickRowEmojis, recordEmojiUse } from '../lib/emoji/recents.svelte';
  import type { Message } from '../lib/state/chat.svelte';
  import Icon, { type IconName } from '../lib/Icon.svelte';
  import Popover from '../lib/Popover.svelte';
  import MenuItem from '../lib/MenuItem.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Action = {
    label: string;
    icon?: IconName;
    onSelect: () => void;
    danger?: boolean;
    disabled?: boolean;
    /** Stable identifier for tests (data-action). Not displayed. */
    action?: string;
  };

  type Props = {
    message: Message;
    /** Page-coordinate anchor for the menu's top-left. */
    x: number;
    y: number;
    onPickEmoji: (emoji: string) => void;
    onMoreEmoji: () => void;
    actions: Action[];
    onClose: () => void;
    /** Which sections to render. `'all'` (default) shows the quick-reaction
     *  row + the action list, matching the right-click menu. `'reactions'`
     *  and `'actions'` render just one half — used by the hover icons next
     *  to each bubble (emoji icon → reactions, menu icon → actions). */
    mode?: 'all' | 'reactions' | 'actions';
  };

  let {
    message,
    x,
    y,
    onPickEmoji,
    onMoreEmoji,
    actions,
    onClose,
    mode = 'all',
  }: Props = $props();
  // `message` is intentionally unread for now — reserved for a future
  // aria-label that names the target bubble. Wrapped in a closure so
  // svelte-check doesn't warn about initial-value capture.
  void (() => message);

  // Quick row mirrors the user's recents (filled with QUICK_REACTIONS until
  // they've used enough emoji). Reactive: re-derives if recents change while
  // the menu is open — though in practice the menu unmounts on every pick.
  let quickEmojis = $derived(quickRowEmojis());

  function pick(emoji: string) {
    recordEmojiUse(emoji);
    onPickEmoji(emoji);
    onClose();
  }
  function more() {
    onMoreEmoji();
    onClose();
  }
  function pickAction(a: Action) {
    if (a.disabled) return;
    a.onSelect();
    onClose();
  }
</script>

<Popover {x} {y} {onClose} data-testid="message-context-menu">
  <div class="body" data-mode={mode}>
    {#if mode !== 'actions'}
      <div class="quick" role="group" aria-label={t('Quick reactions')}>
        {#each quickEmojis as e (e)}
          <button class="emoji" onclick={() => pick(e)} aria-label={e} data-testid="message-context-menu__quick-emoji" data-emoji={e}>{e}</button>
        {/each}
        <button class="emoji more" onclick={more} aria-label={t('More emoji')} data-testid="message-context-menu__more-emoji">
          <Icon name="smile-plus" size={18} />
        </button>
      </div>
    {/if}
    {#if mode !== 'reactions' && actions.length > 0}
      <div class="actions" class:standalone={mode === 'actions'}>
        {#each actions as a}
          <MenuItem
            icon={a.icon}
            label={a.label}
            danger={a.danger}
            disabled={a.disabled}
            onclick={() => pickAction(a)}
            data-testid="message-context-menu-item"
            data-action={a.action ?? ''}
          />
        {/each}
      </div>
    {/if}
  </div>
</Popover>

<style>
  .body {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 180px;
  }
  .quick {
    display: flex;
    gap: 2px;
  }
  .emoji {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    font-size: 18px;
    background: transparent;
  }
  .emoji:hover {
    background: var(--color-bg-hover);
  }
  .emoji.more {
    color: var(--color-fg-tertiary);
  }
  .actions {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--color-border);
    padding-top: 4px;
  }
  /* When the actions list is rendered on its own (mode='actions' from the
   * hover menu icon), the divider above is meaningless — drop it. */
  .actions.standalone {
    border-top: 0;
    padding-top: 0;
  }
</style>
