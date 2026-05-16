<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { IconName } from './Icon.svelte';
  export type Props = Omit<HTMLButtonAttributes, 'children'> & {
    label: string;
    icon?: IconName;
    /** Destructive item — label turns red. */
    danger?: boolean;
    /** Right-aligned accessory (chevron, checkmark, badge…). */
    trailing?: Snippet;
  };
</script>

<script lang="ts">
  // The one menu-row primitive: icon + label, optional trailing accessory,
  // `danger` flag. Replaces the four near-identical `.items button` /
  // `.menu button` style blocks across the popovers.
  import Icon from './Icon.svelte';

  let { label, icon, danger = false, trailing, class: extraClass = '', ...rest }: Props = $props();
</script>

<button class="item {extraClass}" class:danger role="menuitem" {...rest}>
  {#if icon}<span class="ico" aria-hidden="true"><Icon name={icon} size={16} /></span>{/if}
  <span class="label">{label}</span>
  {#if trailing}<span class="trailing">{@render trailing()}</span>{/if}
</button>

<style>
  .item {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-fg);
    text-align: left;
    font-size: var(--text-sm);
    cursor: pointer;
    transition: background 0.1s ease;
  }
  .item:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }
  .item:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
  .item:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ico {
    flex: none;
    display: inline-flex;
    align-items: center;
    color: var(--color-fg-secondary);
  }
  .label {
    flex: 1;
    min-width: 0;
  }
  .item.danger,
  .item.danger .ico {
    color: var(--color-danger);
  }
  .trailing {
    flex: none;
    display: inline-flex;
    align-items: center;
    color: var(--color-fg-tertiary);
  }
</style>
