<script lang="ts" module>
  import type { HTMLSelectAttributes } from 'svelte/elements';
  export type Option = { value: string; label: string };
  export type Props = Omit<HTMLSelectAttributes, 'value'> & {
    /** Bindable value. */
    value: string;
    /** Micro-caps field label rendered above the control. */
    label?: string;
    options: Option[];
  };
</script>

<script lang="ts">
  // Native `<select>` with the shared field chrome + accent focus ring,
  // so settings/onboarding selects match TextInput rather than each
  // re-styling the raw element.
  let { value = $bindable(), label, options, class: extraClass = '', ...rest }: Props = $props();
</script>

<label class="field {extraClass}">
  {#if label}<span class="field-label">{label}</span>{/if}
  <select class="control" bind:value {...rest}>
    {#each options as o (o.value)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
</label>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .field-label {
    font-size: var(--text-xs);
    color: var(--color-fg-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .control {
    height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: inherit;
    font-size: var(--text-md);
    cursor: pointer;
    transition: border-color 0.1s ease, box-shadow 0.1s ease;
  }
  .control:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-soft);
  }
</style>
