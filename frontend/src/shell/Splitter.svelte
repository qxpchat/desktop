<script lang="ts">
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    /** Fires on pointer-down. Parent snapshots the current pane width. */
    onStart?: () => void;
    /** Cumulative delta from `onStart`, in CSS pixels. Always relative to
     *  the drag's origin, never to the previous frame — so snap zones can
     *  decide based on intent without needing to track residual drag in
     *  the parent. */
    onMove: (totalDx: number) => void;
    onEnd?: () => void;
  };

  let { onStart, onMove, onEnd }: Props = $props();

  let dragging = $state(false);
  let originX = 0;

  function down(e: PointerEvent) {
    dragging = true;
    originX = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onStart?.();
    e.preventDefault();
  }

  function move(e: PointerEvent) {
    if (!dragging) return;
    onMove(e.clientX - originX);
  }

  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    onEnd?.();
  }

  // Keyboard nudge: fire start/move/end together so the parent treats it
  // as a complete drag and re-snapshots its origin width.
  function keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      onStart?.();
      onMove(e.key === 'ArrowLeft' ? -16 : 16);
      onEnd?.();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="splitter"
  class:dragging
  role="separator"
  aria-orientation="vertical"
  aria-label={t('Resize chat list')}
  tabindex="0"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onkeydown={keydown}
></div>

<style>
  .splitter {
    flex: 0 0 4px;
    cursor: col-resize;
    background: var(--color-bg);
    transition: background 0.12s ease;
    touch-action: none;
  }
  .splitter:hover,
  .splitter.dragging {
    background: var(--color-accent);
  }
</style>
