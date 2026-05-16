<script lang="ts" module>
  import type { Snippet } from 'svelte';
  export type Props = {
    /** When false the overlay is unmounted entirely. */
    open: boolean;
    /** Called on Escape or backdrop click. */
    onClose: () => void;
    /** Clicking the dimmed backdrop (outside the content) closes. */
    closeOnBackdrop?: boolean;
    /** Backdrop fill. Defaults to the theme `--color-backdrop` token. */
    backdrop?: string;
    /** Apply a blur to whatever sits behind the backdrop. */
    blur?: boolean;
    /** ARIA role. `alertdialog` for confirmation-style dialogs. */
    role?: 'dialog' | 'alertdialog';
    ariaLabel?: string;
    ariaLabelledBy?: string;
    ariaDescribedBy?: string;
    /** Extra class on the overlay root. Style it with `:global()` from the
     *  consumer when the centred-flex default needs overriding. */
    class?: string;
    /** Centred content — the consumer owns its card / panel / media. */
    children: Snippet;
    /** Forwarded to the overlay root for E2E selectors. */
    'data-testid'?: string;
  };
</script>

<script lang="ts">
  // Shared full-screen overlay primitive. Owns the one-and-only copy of the
  // backdrop + Escape + click-outside boilerplate that Modal, ImageLightbox
  // and FullMessageOverlay previously each reimplemented. The Escape listener
  // is installed via `$effect` so it is bound to the open window exactly —
  // the prior `onMount`/`onDestroy` consumers leaked a listener that stayed
  // live (and ate global Escapes) while the overlay was closed.
  let {
    open,
    onClose,
    closeOnBackdrop = true,
    backdrop = 'var(--color-backdrop)',
    blur = false,
    role = 'dialog',
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    class: extraClass = '',
    children,
    ...rest
  }: Props = $props();

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

  // Backdrop hit-test: only a click landing on the overlay root itself —
  // never one that bubbled up from the content — counts as "outside".
  function onBackdropClick(e: MouseEvent) {
    if (closeOnBackdrop && e.target === e.currentTarget) onClose();
  }
  function onBackdropKey(e: KeyboardEvent) {
    if (!closeOnBackdrop) return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
      e.preventDefault();
      onClose();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="overlay {extraClass}"
    class:blur
    style:--overlay-bg={backdrop}
    {role}
    aria-modal="true"
    aria-label={ariaLabel}
    aria-labelledby={ariaLabelledBy}
    aria-describedby={ariaDescribedBy}
    tabindex="-1"
    onclick={onBackdropClick}
    onkeydown={onBackdropKey}
    {...rest}
  >
    {@render children()}
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
    background: var(--overlay-bg);
  }
  .overlay.blur {
    backdrop-filter: blur(4px);
  }
</style>
