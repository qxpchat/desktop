<script lang="ts" module>
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { IconName } from './Icon.svelte';

  /** `overlay` — translucent white, for dark media overlays.
   *  `subtle` — transparent, for close buttons in modal headers / bars. */
  export type Variant = 'overlay' | 'subtle';
  export type Props = Omit<HTMLButtonAttributes, 'children' | 'aria-label'> & {
    icon: IconName;
    /** Required: icon-only buttons need an accessible name. */
    label: string;
    variant?: Variant;
    /** Outer button size in px (icon scales to ~45%). */
    size?: number;
    /** Icon size in px. Defaults to ~45% of `size`. */
    iconSize?: number;
    /** Pin the button in its hover/pressed look (e.g. while its popover is open). */
    active?: boolean;
  };
</script>

<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    icon,
    label,
    variant = 'overlay',
    size = 36,
    iconSize,
    active = false,
    class: extraClass = '',
    ...rest
  }: Props = $props();

  let resolvedIconSize = $derived(iconSize ?? Math.round(size * 0.45));
</script>

<button
  class="icon-btn {extraClass}"
  class:active
  data-variant={variant}
  style="--icon-btn-size: {size}px;"
  aria-label={label}
  {...rest}
>
  <Icon name={icon} size={resolvedIconSize} />
</button>

<style>
  .icon-btn {
    width: var(--icon-btn-size);
    height: var(--icon-btn-size);
    flex: none;
    padding: 0;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s ease;
  }
  .icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .icon-btn[data-variant='overlay'] {
    background: rgba(255, 255, 255, 0.18);
    color: white;
  }
  .icon-btn[data-variant='overlay']:hover:not(:disabled),
  .icon-btn[data-variant='overlay'].active {
    background: rgba(255, 255, 255, 0.3);
  }
  .icon-btn[data-variant='subtle'] {
    background: transparent;
    color: var(--color-fg-secondary);
  }
  .icon-btn[data-variant='subtle']:hover:not(:disabled),
  .icon-btn[data-variant='subtle'].active {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
</style>
