<script lang="ts" module>
  export type Props = {
    open: boolean;
    /** Object URL or data URL for the source image. Caller owns its lifetime. */
    src: string | null;
    /** Output side in pixels. dc-core's avatar pipeline downsamples to ~192,
     *  so the default matches that — no point exporting bigger than the
     *  daemon would re-encode. */
    outputSize?: number;
    onConfirm: (blob: Blob) => void;
    onClose: () => void;
  };
</script>

<script lang="ts">
  // Square-image cropper for avatars / group images. Pure canvas — no
  // dependency on react-cropper, croppie, or similar. Pan by dragging,
  // zoom via mouse wheel; the crop window is always the centred square
  // of the preview canvas.
  //
  // Math: we keep the *displayed* image in a local coordinate system
  //   (PREVIEW × PREVIEW pixels). `scale` is naturalSize → preview-px,
  //   bounded at the lower end so the image always covers the square
  //   (no transparent edges) and at the upper end at 3× the minimum so
  //   we don't crop down to a single pixel.
  //
  // Exporting: draw the same view into an `outputSize × outputSize`
  // canvas, scaled up by `outputSize / PREVIEW`, then `toBlob` as PNG.

  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import { t } from './i18n/i18n.svelte';

  let { open, src, outputSize = 192, onConfirm, onClose }: Props = $props();

  const PREVIEW = 280;

  let canvas: HTMLCanvasElement | undefined = $state();
  let img: HTMLImageElement | null = null;
  let scale = $state(1);
  let minScale = 1;
  let offsetX = $state(0);
  let offsetY = $state(0);
  let dragOrigin: { x: number; y: number; offX: number; offY: number } | null = null;

  // Reload the image every time the dialog opens with a new src.
  $effect(() => {
    if (!open || !src) {
      img = null;
      return;
    }
    const next = new Image();
    next.crossOrigin = 'anonymous';
    next.onload = () => {
      img = next;
      minScale = Math.max(PREVIEW / next.naturalWidth, PREVIEW / next.naturalHeight);
      scale = minScale;
      offsetX = 0;
      offsetY = 0;
      draw();
    };
    next.src = src;
  });

  // Redraw whenever any view parameter changes (Svelte 5 reads inside
  // `$effect` register as deps — accessing `scale` etc. is enough).
  $effect(() => {
    if (!open) return;
    void scale;
    void offsetX;
    void offsetY;
    void canvas;
    draw();
  });

  function draw() {
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, PREVIEW, PREVIEW);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, PREVIEW / 2 - w / 2 + offsetX, PREVIEW / 2 - h / 2 + offsetY, w, h);
  }

  function clampOffset() {
    if (!img) return;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const maxX = Math.max(0, (w - PREVIEW) / 2);
    const maxY = Math.max(0, (h - PREVIEW) / 2);
    offsetX = Math.max(-maxX, Math.min(offsetX, maxX));
    offsetY = Math.max(-maxY, Math.min(offsetY, maxY));
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !img) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragOrigin = { x: e.clientX, y: e.clientY, offX: offsetX, offY: offsetY };
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragOrigin) return;
    offsetX = dragOrigin.offX + (e.clientX - dragOrigin.x);
    offsetY = dragOrigin.offY + (e.clientY - dragOrigin.y);
    clampOffset();
  }
  function onPointerUp(e: PointerEvent) {
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    dragOrigin = null;
  }
  function onWheel(e: WheelEvent) {
    if (!img) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.94 : 1.06;
    scale = Math.max(minScale, Math.min(scale * factor, minScale * 3));
    clampOffset();
  }

  function confirm() {
    if (!img) {
      onClose();
      return;
    }
    const out = document.createElement('canvas');
    out.width = outputSize;
    out.height = outputSize;
    const ctx = out.getContext('2d');
    if (!ctx) {
      onClose();
      return;
    }
    const ratio = outputSize / PREVIEW;
    const w = img.naturalWidth * scale * ratio;
    const h = img.naturalHeight * scale * ratio;
    ctx.drawImage(
      img,
      outputSize / 2 - w / 2 + offsetX * ratio,
      outputSize / 2 - h / 2 + offsetY * ratio,
      w,
      h,
    );
    out.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
        else onClose();
      },
      'image/png',
    );
  }
</script>

<Modal {open} {onClose} size="sm" ariaLabel={t('Crop image')} data-testid="image-cropper-dialog">
  <div class="content">
    <h2>{t('Crop image')}</h2>
    <p>{t('Drag to position, scroll to zoom.')}</p>
    <div
      class="frame"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onwheel={onWheel}
      role="img"
      aria-label={t('Image crop preview')}
    >
      <canvas bind:this={canvas} width={PREVIEW} height={PREVIEW}></canvas>
      <!-- Overlay ring marks the visible crop area; canvas IS the crop
           area, so this is purely decorative. -->
      <div class="ring" aria-hidden="true"></div>
    </div>
    <div class="actions">
      <Button variant="primary" onclick={confirm} data-testid="image-cropper-dialog__save">
        {t('Save')}
      </Button>
      <Button variant="secondary" onclick={onClose} data-testid="image-cropper-dialog__cancel">
        {t('Cancel')}
      </Button>
    </div>
  </div>
</Modal>

<style>
  .content {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: center;
  }
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
    align-self: flex-start;
  }
  p {
    margin: 0;
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
    align-self: flex-start;
  }
  .frame {
    position: relative;
    width: 280px;
    height: 280px;
    margin: var(--space-2) 0;
    border-radius: 50%;
    overflow: hidden;
    background: var(--color-bg);
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .frame:active {
    cursor: grabbing;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid var(--color-accent);
    pointer-events: none;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: var(--space-2);
    align-self: stretch;
  }
</style>
