<script lang="ts">
  // Camera-backed QR scanner. Tries the native BarcodeDetector first
  // (Chrome/Edge/Safari 17+), falls back to jsQR for Firefox.
  //
  // Reused by Phase 2 step 4 (backup pair) and Phase 11 (general QR scan).

  import { onMount, onDestroy } from 'svelte';
  import jsQR from 'jsqr';

  type Props = {
    onResult: (qr: string) => void;
    onError?: (msg: string) => void;
  };

  let { onResult, onError }: Props = $props();

  let video: HTMLVideoElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let stream: MediaStream | null = null;
  let raf: number | null = null;
  let active = false;
  let permError = $state<string | null>(null);

  // BarcodeDetector is not in lib.dom yet; cast through `unknown`.
  let nativeDetector: { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> } | null = null;

  onMount(async () => {
    if (!video || !canvas) return;

    // Camera APIs require a secure context (HTTPS or localhost). Plain HTTP
    // on a LAN hostname (e.g. http://nixos.local) leaves `mediaDevices`
    // undefined.
    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = window.isSecureContext
        ? 'Camera is not available in this browser.'
        : 'Camera needs an HTTPS or localhost URL. Use Paste Code below, or open this app from localhost.';
      permError = msg;
      onError?.(msg);
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();

      const w = window as unknown as { BarcodeDetector?: new (init: { formats: string[] }) => typeof nativeDetector };
      if (w.BarcodeDetector) {
        try {
          nativeDetector = new w.BarcodeDetector({ formats: ['qr_code'] }) as unknown as typeof nativeDetector;
        } catch {
          nativeDetector = null;
        }
      }

      active = true;
      raf = requestAnimationFrame(scan);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      permError = msg;
      onError?.(msg);
    }
  });

  onDestroy(() => {
    active = false;
    if (raf != null) cancelAnimationFrame(raf);
    if (stream) for (const track of stream.getTracks()) track.stop();
  });

  async function scan() {
    if (!active || !video || !canvas) return;
    if (video.readyState >= video.HAVE_METADATA && video.videoWidth > 0) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h);
        let qr: string | null = null;

        if (nativeDetector) {
          try {
            const codes = await nativeDetector.detect(canvas);
            if (codes.length > 0) qr = codes[0].rawValue;
          } catch {
            // fall through to jsQR
          }
        }

        if (!qr) {
          const data = ctx.getImageData(0, 0, w, h);
          const result = jsQR(data.data, data.width, data.height, {
            inversionAttempts: 'dontInvert',
          });
          if (result) qr = result.data;
        }

        if (qr) {
          active = false;
          onResult(qr);
          return;
        }
      }
    }
    raf = requestAnimationFrame(scan);
  }
</script>

<div class="scanner">
  {#if permError}
    <div class="error">
      <p>Camera unavailable.</p>
      <p class="msg">{permError}</p>
    </div>
  {:else}
    <video bind:this={video} playsinline muted></video>
    <canvas bind:this={canvas} hidden></canvas>
    <div class="frame" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .scanner {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    max-width: 360px;
    background: #000;
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .frame {
    position: absolute;
    inset: 12%;
    border: 2px solid rgba(255, 255, 255, 0.7);
    border-radius: var(--radius-md);
    pointer-events: none;
  }
  .error {
    height: 100%;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-4);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
  }
  .error .msg {
    color: var(--color-fg-tertiary);
    font-size: var(--text-sm);
    margin-top: var(--space-2);
  }
</style>
