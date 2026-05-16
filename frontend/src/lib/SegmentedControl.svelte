<script lang="ts" module>
  export type Segment<T> = {
    value: T;
    label: string;
    /** Optional `data-testid` for the segment button (E2E hook). */
    testId?: string;
    /** Optional extra `data-*` attributes for the segment button. */
    data?: Record<string, string>;
  };
</script>

<script lang="ts" generics="T extends string | number">
  // Pill segmented radio group. One implementation for the theme /
  // text-size pickers and the logs filter strip, which previously each
  // hand-rolled a divergent segmented control.
  type Props = {
    options: Segment<T>[];
    value: T;
    onChange: (value: T) => void;
    ariaLabel?: string;
    /** Forwarded to the group container for E2E selectors. */
    'data-testid'?: string;
  };

  let { options, value, onChange, ariaLabel, ...rest }: Props = $props();
</script>

<div class="seg" role="radiogroup" aria-label={ariaLabel} {...rest}>
  {#each options as o (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === o.value}
      class:active={value === o.value}
      onclick={() => onChange(o.value)}
      data-testid={o.testId}
      {...o.data}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    padding: 3px;
    background: var(--color-bg-hover);
    border-radius: var(--radius-md);
    gap: 2px;
  }
  .seg button {
    padding: 6px 16px;
    border: 0;
    background: transparent;
    border-radius: calc(var(--radius-md) - 2px);
    color: var(--color-fg);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;
  }
  .seg button:hover:not(.active) {
    background: var(--color-bg);
  }
  .seg button.active {
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .seg button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
