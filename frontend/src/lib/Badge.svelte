<script lang="ts">
  // Unread-count pill — one source of truth for the accent badge shown on
  // chat rows, profile tabs, the burger menu and the scroll-to-latest
  // button. `corner` pins it to a `position: relative` parent's top-right;
  // `ring` draws a 2px halo (pass the colour of the surface it overlaps).
  import type { HTMLAttributes } from 'svelte/elements';

  type Props = {
    /** Count to show; rendered as the label, clamped to "99+". */
    count: number;
    /** Pin to the parent's top-right corner (parent must be positioned). */
    corner?: boolean;
    /** Ring colour — set when the badge overlaps content so it reads
     *  cleanly against that surface. Omit for a flush, ring-less badge. */
    ring?: string;
  } & HTMLAttributes<HTMLSpanElement>;

  let { count, corner = false, ring, ...rest }: Props = $props();
  let label = $derived(count > 99 ? '99+' : String(count));
</script>

<span
  class="badge"
  class:corner
  class:ring={ring != null}
  style:--badge-ring={ring}
  {...rest}
>{label}</span>

<style>
  .badge {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-size: var(--text-xs);
    font-weight: 700;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
    flex: 0 0 auto;
  }
  .badge.corner {
    position: absolute;
    top: -4px;
    right: -4px;
    /* Overlays an interactive element — let clicks reach it. */
    pointer-events: none;
  }
  .badge.ring {
    border: 2px solid var(--badge-ring);
  }
</style>
