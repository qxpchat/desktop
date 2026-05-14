<script lang="ts" module>
  import type { Snippet } from 'svelte';
  export type Props = {
    /** Page-coordinate anchor for the popover's top-left, before clamping. */
    x: number;
    y: number;
    onClose: () => void;
    /** Override the default Escape behaviour (which is `onClose`). Used by
     *  ChatRowMenu's mute submenu — Escape backs out to the main view
     *  instead of dismissing the whole popover. */
    onEscape?: () => void;
    children: Snippet;
    ariaLabel?: string;
    /** Extra class on the popover container (rare). */
    class?: string;
    /** Forwarded to the inner positioned container for E2E selectors. */
    'data-testid'?: string;
  };
</script>

<script lang="ts">
  let {
    x,
    y,
    onClose,
    onEscape,
    children,
    ariaLabel,
    class: extraClass = '',
    ...rest
  }: Props = $props();

  let menu: HTMLDivElement | undefined = $state();
  // svelte-ignore state_referenced_locally
  let style = $state(`top: ${y}px; left: ${x}px;`);

  // Once the menu has mounted, measure it and clamp so it doesn't overflow
  // viewport edges. Re-runs if x/y change (e.g. the parent re-anchors).
  $effect(() => {
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
    style = `top: ${Math.max(8, top)}px; left: ${Math.max(8, left)}px;`;
  });

  // Window-level Escape. Effect cleanup pairs the listener with the
  // component lifecycle so it auto-unsubscribes on unmount.
  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      (onEscape ?? onClose)();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<!-- Invisible backdrop catches outside-clicks. Keyboard-dismissable via the
     window-level Escape handler installed in the effect above. -->
<button class="backdrop" onclick={onClose} aria-label="Close popover"></button>
<div
  bind:this={menu}
  class="popover {extraClass}"
  role="menu"
  aria-label={ariaLabel}
  {style}
  {...rest}
>
  {@render children()}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: 0;
    z-index: var(--z-overlay);
    cursor: default;
  }
  .popover {
    position: fixed;
    z-index: calc(var(--z-overlay) + 1);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px var(--color-shadow);
  }
</style>
