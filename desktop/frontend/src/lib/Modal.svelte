<script lang="ts" module>
  import type { Snippet } from 'svelte';
  export type Size = 'sm' | 'md' | 'lg';
  export type Props = {
    open: boolean;
    onClose: () => void;
    /** Width preset. sm=360, md=420, lg=520. */
    size?: Size;
    /** Card content — provides its own header / body / actions layout.
     *  Pad with `var(--space-5)` to match the codebase's existing dialogs. */
    children: Snippet;
    /** ARIA role. `alertdialog` for confirmation-style dialogs. */
    role?: 'dialog' | 'alertdialog';
    ariaLabel?: string;
    ariaLabelledBy?: string;
    ariaDescribedBy?: string;
    /** Extra class on the overlay (rare — most consumers don't need it). */
    class?: string;
    /** Forwarded to the outer overlay for E2E selectors. */
    'data-testid'?: string;
  };
</script>

<script lang="ts">
  let {
    open,
    onClose,
    size = 'md',
    children,
    role = 'dialog',
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    class: extraClass = '',
    ...rest
  }: Props = $props();

  // Install the window-level Escape handler only while the modal is open.
  // Prior consumers added the listener in `onMount` (so it survived
  // `open=false`, leaking a handler per dialog) — effect cleanup pairs the
  // listener with the open window exactly.
  $effect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

{#if open}
  <div
    class="overlay {extraClass}"
    {role}
    aria-modal="true"
    aria-label={ariaLabel}
    aria-labelledby={ariaLabelledBy}
    aria-describedby={ariaDescribedBy}
    {...rest}
  >
    <button class="backdrop" aria-label="Close" onclick={onClose}></button>
    <div class="card" data-size={size}>
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    background: var(--color-backdrop);
    backdrop-filter: blur(4px);
    border: 0;
    cursor: default;
  }
  .card {
    position: relative;
    z-index: 1;
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 48px var(--color-shadow);
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 2 * var(--space-5));
    overflow: hidden;
  }
  .card[data-size='sm'] {
    width: min(360px, calc(100vw - 2 * var(--space-4)));
  }
  .card[data-size='md'] {
    width: min(420px, calc(100vw - 2 * var(--space-4)));
  }
  .card[data-size='lg'] {
    width: min(520px, calc(100vw - 2 * var(--space-4)));
  }
</style>
