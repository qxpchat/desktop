<script lang="ts" module>
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { IconName } from './Icon.svelte';

  /** `overlay` — translucent white, for dark media overlays.
   *  `subtle` — transparent, neutral icon, for close buttons in modal
   *    headers / bars.
   *  `primary` — filled accent circle, for the composer send affordance.
   *  `accent` — transparent, accent-colored icon (e.g. the composer
   *    compose affordance).
   *  `danger` — transparent, danger-colored icon, for destructive
   *    icon-only actions (delete / remove). */
  export type Variant = 'overlay' | 'subtle' | 'primary' | 'accent' | 'danger';
  /** `circle` — the default round chrome (close buttons, media overlays).
   *  `square` — rounded-rect, for icon buttons that sit in toolbars /
   *    settings rows next to rectangular siblings. */
  export type Shape = 'circle' | 'square';
  export type Props = Omit<HTMLButtonAttributes, 'children' | 'aria-label'> & {
    icon: IconName;
    /** Required: icon-only buttons need an accessible name. */
    label: string;
    variant?: Variant;
    shape?: Shape;
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
    shape = 'circle',
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
  data-shape={shape}
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
    transition: background 0.1s ease, color 0.1s ease;
  }
  .icon-btn[data-shape='square'] {
    border-radius: var(--radius-md);
  }
  .icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .icon-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
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
  .icon-btn[data-variant='primary'] {
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .icon-btn[data-variant='primary']:hover:not(:disabled),
  .icon-btn[data-variant='primary'].active {
    filter: brightness(1.05);
  }
  .icon-btn[data-variant='accent'] {
    background: transparent;
    color: var(--color-accent);
  }
  .icon-btn[data-variant='accent']:hover:not(:disabled),
  .icon-btn[data-variant='accent'].active {
    background: var(--color-bg-hover);
  }
  .icon-btn[data-variant='danger'] {
    background: transparent;
    color: var(--color-danger);
  }
  .icon-btn[data-variant='danger']:hover:not(:disabled),
  .icon-btn[data-variant='danger'].active {
    background: var(--color-danger-soft);
  }
</style>
