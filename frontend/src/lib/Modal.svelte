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
  // A card-chrome dialog: the centred-card layer on top of the shared
  // `Overlay` primitive, which owns the backdrop + Escape + click-outside.
  import Overlay from './Overlay.svelte';

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
</script>

<Overlay
  {open}
  {onClose}
  {role}
  {ariaLabel}
  {ariaLabelledBy}
  {ariaDescribedBy}
  class={extraClass}
  blur
  {...rest}
>
  <div class="card" data-size={size}>
    {@render children()}
  </div>
</Overlay>

<style>
  .card {
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
