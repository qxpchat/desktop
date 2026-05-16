<script lang="ts" module>
  import type { HTMLButtonAttributes } from 'svelte/elements';
  export type Props = Omit<HTMLButtonAttributes, 'children'> & {
    /** Visible label. Pass a translated string; defaults to "Back". */
    label?: string;
  };
</script>

<script lang="ts">
  // The one back-affordance for every topbar / wizard step. Was hand-rolled
  // ~11 times with three different glyphs (←, ‹, ‹ Back) and inconsistent
  // (often missing) hover states — this is the single source of truth:
  // chevron-left Icon + accent label + the standard bg-hover highlight.
  import Icon from './Icon.svelte';

  let { label = 'Back', class: extraClass = '', ...rest }: Props = $props();
</script>

<button class="back {extraClass}" {...rest}>
  <Icon name="chevron-left" size={16} />
  <span>{label}</span>
</button>

<style>
  .back {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 30px;
    padding: 0 var(--space-2) 0 var(--space-1);
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-accent);
    font-size: var(--text-md);
    font-weight: 500;
    cursor: pointer;
    transition: background 0.1s ease;
  }
  .back:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }
  .back:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .back:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
