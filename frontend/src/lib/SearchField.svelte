<script lang="ts" module>
  import type { HTMLInputAttributes } from 'svelte/elements';
  export type Props = Omit<HTMLInputAttributes, 'value' | 'type' | 'size'> & {
    /** Bindable value. */
    value: string;
  };
</script>

<script lang="ts">
  // The shared search box: pill-ish field, `bg-hover` fill, leading
  // search icon. Replaces the verbatim-copied `<input type="search">`
  // blocks in the chat list, pickers and emoji picker.
  import Icon from './Icon.svelte';

  let { value = $bindable(), class: extraClass = '', ...rest }: Props = $props();

  let inputEl: HTMLInputElement | undefined = $state();

  /** Focus + select the field — for keyboard shortcuts (e.g. Cmd-K). */
  export function focus(): void {
    inputEl?.focus();
    inputEl?.select();
  }
</script>

<div class="search {extraClass}">
  <span class="ico" aria-hidden="true"><Icon name="search" size={15} /></span>
  <input bind:this={inputEl} type="search" bind:value {...rest} />
</div>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 32px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    background: var(--color-bg-hover);
    transition: border-color 0.1s ease, box-shadow 0.1s ease;
  }
  .search:focus-within {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-soft);
  }
  .ico {
    flex: none;
    display: inline-flex;
    color: var(--color-fg-tertiary);
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--color-fg);
    font-family: inherit;
    font-size: var(--text-md);
  }
  input:focus {
    outline: none;
  }
  input::placeholder {
    color: var(--color-fg-tertiary);
  }
  /* Drop the WebKit search decorations so the field reads as our own. */
  input::-webkit-search-decoration,
  input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }
</style>
