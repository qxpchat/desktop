<script lang="ts">
  // Right-click context menu anchored to a clicked message bubble. Shows the
  // quick-reaction row + a list of actions. Phase 10 fills in the action
  // callbacks (reply / forward / edit / delete / copy); for Phase 9 the
  // reaction row is the primary surface and "more" opens the emoji picker.

  import { quickRowEmojis, recordEmojiUse } from '../lib/emoji/recents.svelte';
  import type { Message } from '../lib/state/chat.svelte';
  import Icon, { type IconName } from '../lib/Icon.svelte';
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
  };

  let { message, x, y, onPickEmoji, onMoreEmoji, actions, onClose }: Props = $props();

  // Reserved for future aria-label that names the message — we read it inside
  // a closure so svelte-check doesn't warn about initial-value capture.
  void (() => message);

  // Adjust position so the menu doesn't overflow viewport edges.
  let menu: HTMLDivElement | undefined = $state();
  // Initial style reads from the click coords; the effect below repositions
  // once the menu rect is known. Suppress the "initial value" warning — the
  // component is re-created on every right-click so we always start fresh.
  // svelte-ignore state_referenced_locally
  let style = $state(`top: ${y}px; left: ${x}px;`);
  $effect(() => {
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
    style = `top: ${Math.max(8, top)}px; left: ${Math.max(8, left)}px;`;
  });

  // Quick row mirrors the user's recents (filled with QUICK_REACTIONS until
  // they've used enough emoji). Reactive: re-derives if recents change
  // while the menu is open — though in practice the menu unmounts on every
  // pick.
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

<button class="backdrop" onclick={onClose} aria-label={t('Close menu')}></button>
<div bind:this={menu} class="menu" style={style} role="menu" data-testid="message-context-menu">
  <div class="quick" role="group" aria-label={t('Quick reactions')}>
    {#each quickEmojis as e (e)}
      <button class="emoji" onclick={() => pick(e)} aria-label={e} data-testid="message-context-menu__quick-emoji" data-emoji={e}>{e}</button>
    {/each}
    <button class="emoji more" onclick={more} aria-label={t('More emoji')} data-testid="message-context-menu__more-emoji">
      <Icon name="smile-plus" size={18} />
    </button>
  </div>
  {#if actions.length > 0}
    <div class="actions">
      {#each actions as a}
        <button
          class="action"
          class:danger={a.danger}
          disabled={a.disabled}
          onclick={() => pickAction(a)}
          role="menuitem"
          data-testid="message-context-menu-item"
          data-action={a.action ?? ''}
        >
          {#if a.icon}
            <span class="action-icon" aria-hidden="true">
              <Icon name={a.icon} size={16} />
            </span>
          {/if}
          <span>{a.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 20;
    border: 0;
    cursor: default;
  }
  .menu {
    position: fixed;
    z-index: 21;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px var(--color-shadow);
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
  .action {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-fg);
    text-align: left;
    font-size: var(--text-sm);
  }
  .action:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }
  .action:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .action.danger {
    color: var(--color-danger);
  }
  .action-icon {
    width: 18px;
    text-align: center;
  }
</style>
