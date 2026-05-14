<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  export type Variant = 'primary' | 'secondary' | 'danger' | 'danger-text' | 'ghost' | 'accent-text';
  /** `md` is the default dialog-action height (36px). `lg` is the onboarding
   *  / wizard CTA height (48px). `sm` is for compact rows (30px). */
  export type Size = 'sm' | 'md' | 'lg';
  export type Props = Omit<HTMLButtonAttributes, 'children'> & {
    variant?: Variant;
    size?: Size;
    /** Stretch to `width: 100%` — used for onboarding/wizard CTAs. */
    block?: boolean;
    children?: Snippet;
  };
</script>

<script lang="ts">
  // Pluck `class` out of `rest` so consumers can pass an extra class
  // without clobbering the hardcoded `btn` (Svelte 5's spread attribute
  // wins last-write, so a bare `<button class="btn" {...rest}>` would
  // lose its base class if `rest.class` were set).
  let {
    variant = 'secondary',
    size = 'md',
    block = false,
    children,
    class: extraClass = '',
    ...rest
  }: Props = $props();
</script>

<button
  class="btn {extraClass}"
  data-variant={variant}
  data-size={size}
  data-block={block ? 'true' : undefined}
  {...rest}
>
  {@render children?.()}
</button>

<style>
  .btn {
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: var(--text-md);
    border: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    transition: filter 0.1s ease, background 0.1s ease;
  }
  .btn[data-size='sm'] {
    height: 30px;
    padding: 0 var(--space-3);
    font-size: var(--text-sm);
  }
  .btn[data-size='md'] {
    height: 36px;
  }
  .btn[data-size='lg'] {
    height: 48px;
    padding: 0 var(--space-5);
  }
  .btn[data-block='true'] {
    width: 100%;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn[data-variant='primary'] {
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .btn[data-variant='primary']:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  .btn[data-variant='secondary'] {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .btn[data-variant='secondary']:hover:not(:disabled) {
    background: var(--color-border);
  }
  .btn[data-variant='danger'] {
    background: var(--color-danger);
    color: white;
  }
  .btn[data-variant='danger']:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  /* Destructive action that wants to read as "secondary" in weight —
   * gray fill with red label. Used for the in-app delete confirmations
   * (mirrors iOS / deltachat-desktop's destructive-row style). */
  .btn[data-variant='danger-text'] {
    background: var(--color-bg-hover);
    color: var(--color-danger);
    font-weight: 500;
  }
  .btn[data-variant='danger-text']:hover:not(:disabled) {
    background: var(--color-border);
  }
  .btn[data-variant='ghost'] {
    background: transparent;
    color: var(--color-fg);
  }
  .btn[data-variant='ghost']:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }
  /* Transparent surface with accent-colored text — the onboarding
   * "I already have a profile" alternative, link-shaped wizard secondary. */
  .btn[data-variant='accent-text'] {
    background: transparent;
    color: var(--color-accent);
  }
  .btn[data-variant='accent-text']:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }
</style>
