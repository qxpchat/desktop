<script lang="ts">
  type Props = {
    onMove: (deltaX: number) => void;
  };

  let { onMove }: Props = $props();

  let dragging = $state(false);
  let startX = 0;

  function down(e: PointerEvent) {
    dragging = true;
    startX = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function move(e: PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (dx === 0) return;
    onMove(dx);
    startX = e.clientX;
  }

  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onMove(-16);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onMove(16);
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
  aria-label="Resize chat list"
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
    background: var(--color-border);
    transition: background 0.12s ease;
    touch-action: none;
  }
  .splitter:hover,
  .splitter.dragging {
    background: var(--color-accent);
  }
</style>
