<script lang="ts">
  import Overlay from '../lib/Overlay.svelte';
  import { lightbox, closeLightbox, lightboxStep } from '../lib/state/lightbox.svelte';
  import { formatDateTime } from '../lib/format/timestamp';
  import { t } from '../lib/i18n/i18n.svelte';
  import IconButton from '../lib/IconButton.svelte';
  import Icon from '../lib/Icon.svelte';

  let item = $derived(lightbox.items[lightbox.index] ?? null);
  let hasGallery = $derived(lightbox.items.length > 1);

  // ← / → step the chat gallery. Escape is owned by Overlay. Listener is
  // bound to the open window via effect cleanup.
  $effect(() => {
    if (item == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        lightboxStep(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        lightboxStep(1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<Overlay
  open={item != null}
  onClose={closeLightbox}
  ariaLabel={t('Image viewer')}
  backdrop="rgba(0, 0, 0, 0.92)"
  class="lightbox-overlay"
  data-testid="image-lightbox"
>
  {#if item}
    <div class="content">
      {#if item.kind === 'image'}
        <img
          src={item.url}
          alt={item.caption ?? ''}
          data-testid="image-lightbox__media"
          data-msg-id={item.msgId}
        />
      {:else}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          src={item.url}
          controls
          autoplay
          data-testid="image-lightbox__media"
          data-msg-id={item.msgId}
        ></video>
      {/if}
      {#if item.caption || item.timestamp}
        <div class="meta">
          {#if item.caption}
            <div class="caption" data-testid="image-lightbox__caption">{item.caption}</div>
          {/if}
          {#if item.timestamp}
            <div class="timestamp" data-testid="image-lightbox__timestamp">
              {formatDateTime(item.timestamp)}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if hasGallery}
      <IconButton
        class="lightbox-nav lightbox-prev"
        icon="chevron-left"
        label={t('Previous')}
        size={44}
        onclick={() => lightboxStep(-1)}
        data-testid="image-lightbox__prev"
      />
      <IconButton
        class="lightbox-nav lightbox-next"
        icon="chevron-right"
        label={t('Next')}
        size={44}
        onclick={() => lightboxStep(1)}
        data-testid="image-lightbox__next"
      />
    {/if}

    <a
      class="lightbox-download"
      href={item.url}
      download={item.fileName ?? ''}
      aria-label={t('Download')}
      title={t('Download')}
      data-testid="image-lightbox__download"
    >
      <Icon name="download" size={16} />
    </a>

    <IconButton
      class="lightbox-close"
      icon="x"
      label={t('Close')}
      onclick={closeLightbox}
    />
  {/if}
</Overlay>

<style>
  /* The dark backdrop reads as click-to-dismiss. */
  :global(.lightbox-overlay) {
    cursor: zoom-out;
  }
  /* Stacks the media above its caption. `pointer-events: none` lets a click
     on the 32px gutter fall through to the Overlay backdrop and dismiss —
     only the media and caption themselves swallow the click. */
  .content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px;
    pointer-events: none;
  }
  img,
  video {
    max-width: 100%;
    max-height: calc(100vh - 96px);
    border-radius: 4px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    pointer-events: auto;
    cursor: default;
  }
  .meta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    max-width: 80%;
    pointer-events: auto;
    cursor: default;
  }
  .caption {
    color: rgba(255, 255, 255, 0.9);
    font-size: var(--text-sm);
    text-align: center;
  }
  .timestamp {
    color: rgba(255, 255, 255, 0.55);
    font-size: var(--text-xs);
    text-align: center;
  }
  :global(.lightbox-close) {
    position: absolute;
    top: 16px;
    right: 16px;
  }
  /* Mirrors IconButton's `overlay` look so the download affordance sits
     beside the close button without dragging in the full IconButton API
     (we need an <a download> anchor, not a button). */
  .lightbox-download {
    position: absolute;
    top: 16px;
    right: 64px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.18);
    color: white;
    text-decoration: none;
    transition: background 0.1s ease;
  }
  .lightbox-download:hover {
    background: rgba(255, 255, 255, 0.3);
  }
  .lightbox-download:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  :global(.lightbox-nav) {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }
  :global(.lightbox-prev) {
    left: 16px;
  }
  :global(.lightbox-next) {
    right: 16px;
  }
</style>
