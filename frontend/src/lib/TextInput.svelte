<script lang="ts" module>
  import type { HTMLInputAttributes, HTMLTextareaAttributes } from 'svelte/elements';
  export type Props = Omit<HTMLInputAttributes, 'value' | 'size'> & {
    /** Bindable value. */
    value: string;
    /** Micro-caps field label rendered above the control. */
    label?: string;
    /** Hint line rendered below the control. */
    description?: string;
    /** Render a `<textarea>` instead of an `<input>`. */
    multiline?: boolean;
    /** Textarea row count (ignored unless `multiline`). */
    rows?: number;
    /** Text alignment — `right` for numeric inputs, `center` for name fields. */
    align?: 'left' | 'center' | 'right';
  };
</script>

<script lang="ts">
  // The single text-entry primitive. Consolidates the half-dozen
  // hand-rolled `<label class="field"><span>…</span><input></label>`
  // blocks that had drifted across three input heights, two label
  // styles and a missing focus ring. Owns the accent focus ring so no
  // consumer needs `outline: none` (the prior a11y regression).
  let {
    value = $bindable(),
    label,
    description,
    multiline = false,
    rows = 3,
    align = 'left',
    class: extraClass = '',
    ...rest
  }: Props = $props();
</script>

<label class="field {extraClass}">
  {#if label}<span class="field-label">{label}</span>{/if}
  {#if multiline}
    <textarea
      class="control"
      {rows}
      bind:value
      style:text-align={align}
      {...rest as HTMLTextareaAttributes}
    ></textarea>
  {:else}
    <input class="control" bind:value style:text-align={align} {...rest} />
  {/if}
  {#if description}<span class="field-desc">{description}</span>{/if}
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
  .field-desc {
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
  }
  .control {
    width: 100%;
    box-sizing: border-box;
    height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: inherit;
    font-size: var(--text-md);
    transition: border-color 0.1s ease, box-shadow 0.1s ease;
  }
  textarea.control {
    height: auto;
    padding: var(--space-2) var(--space-3);
    resize: vertical;
    line-height: 1.4;
  }
  .control:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-soft);
  }
  .control:disabled {
    color: var(--color-fg-tertiary);
    background: var(--color-bg-hover);
    cursor: default;
  }
  .control::placeholder {
    color: var(--color-fg-tertiary);
  }
</style>
