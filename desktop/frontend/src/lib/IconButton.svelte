<script lang="ts" module>
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { IconName } from './Icon.svelte';

  export type Variant = 'overlay';
  export type Props = Omit<HTMLButtonAttributes, 'children' | 'aria-label'> & {
    icon: IconName;
    /** Required: icon-only buttons need an accessible name. */
    label: string;
    variant?: Variant;
    /** Outer button size in px (icon scales to ~45%). */
    size?: number;
  };
</script>

<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    icon,
    label,
    variant = 'overlay',
    size = 36,
    class: extraClass = '',
    ...rest
  }: Props = $props();

  let iconSize = $derived(Math.round(size * 0.45));
</script>

<button
  class="icon-btn {extraClass}"
  data-variant={variant}
  style="--icon-btn-size: {size}px;"
  aria-label={label}
  {...rest}
>
  <Icon name={icon} size={iconSize} />
</button>

<style>
  .icon-btn {
    width: var(--icon-btn-size);
    height: var(--icon-btn-size);
    padding: 0;
    border: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s ease;
  }
  .icon-btn[data-variant='overlay'] {
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    color: white;
  }
  .icon-btn[data-variant='overlay']:hover {
    background: rgba(255, 255, 255, 0.3);
  }
</style>
