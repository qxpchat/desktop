<script lang="ts">
  // Row primitive matching Signal Desktop's `SettingsControl`:
  //   icon? | (label + description?) | right? | chevron-on-clickable
  // Min height 48 so toggles / selects sit comfortably; full-width hover
  // on clickable rows; danger flag turns the label red.
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';

  type Props = {
    label: string;
    description?: string;
    icon?: IconName;
    /** When set the entire row is a button with hover state + chevron. */
    onClick?: () => void;
    /** Custom accessory on the right (toggle, select, text value, etc.).
     *  When omitted on a clickable row, a chevron is rendered. */
    right?: Snippet;
    danger?: boolean;
    disabled?: boolean;
  };

  let { label, description, icon, onClick, right, danger = false, disabled = false }: Props = $props();
</script>

{#snippet body()}
  {#if icon}
    <span class="icon"><Icon name={icon} size={18} /></span>
  {/if}
  <span class="key">
    <span class="label">{label}</span>
    {#if description}<span class="desc">{description}</span>{/if}
  </span>
  {#if right}
    <span class="value">{@render right()}</span>
  {:else if onClick}
    <span class="value chevron"><Icon name="chevron-right" size={14} /></span>
  {/if}
{/snippet}

{#if onClick}
  <button
    type="button"
    class="row clickable"
    class:danger
    {disabled}
    onclick={onClick}
  >
    {@render body()}
  </button>
{:else}
  <div class="row" class:danger>
    {@render body()}
  </div>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 48px;
    padding: 8px 0;
    width: 100%;
    background: transparent;
    color: var(--color-fg);
    text-align: left;
  }
  .clickable {
    border: 0;
    cursor: pointer;
    transition: background 0.1s ease;
  }
  .clickable:hover:not(:disabled) {
    background: var(--color-bg-hover);
    /* Bleed the hover bg into the page's 24px inline padding so the row
       looks like a full-width Signal row rather than a card. */
    margin-inline: calc(-1 * var(--space-3));
    padding-inline: var(--space-3);
    border-radius: var(--radius-md);
  }
  .clickable:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .icon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    color: var(--color-fg-secondary);
  }
  .key {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    /* One step larger than the rest of the UI for the same reason chat
     * bubbles use --text-lg — settings rows are the primary readable
     * content on these screens. Descriptions stay smaller for hierarchy. */
    font-size: var(--text-lg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .danger .label {
    color: var(--color-danger);
  }
  .desc {
    font-size: var(--text-md);
    color: var(--color-fg-secondary);
  }
  .value {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-fg-secondary);
  }
  .chevron {
    color: var(--color-fg-tertiary);
  }
</style>
