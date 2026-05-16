<script lang="ts">
  import Overlay from '../lib/Overlay.svelte';
  import { lightbox, closeLightbox } from '../lib/state/lightbox.svelte';
  import { t } from '../lib/i18n/i18n.svelte';
  import IconButton from '../lib/IconButton.svelte';
</script>

<Overlay
  open={lightbox.item != null}
  onClose={closeLightbox}
  ariaLabel={t('Image viewer')}
  backdrop="rgba(0, 0, 0, 0.92)"
  class="lightbox-overlay"
>
  {#if lightbox.item}
    <div class="content">
      {#if lightbox.item.kind === 'image'}
        <img src={lightbox.item.url} alt={lightbox.item.caption ?? ''} />
      {:else}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={lightbox.item.url} controls autoplay></video>
      {/if}
      {#if lightbox.item.caption}
        <div class="caption">{lightbox.item.caption}</div>
      {/if}
    </div>
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
  .caption {
    color: rgba(255, 255, 255, 0.9);
    font-size: var(--text-sm);
    max-width: 80%;
    text-align: center;
    pointer-events: auto;
    cursor: default;
  }
  :global(.lightbox-close) {
    position: absolute;
    top: 16px;
    right: 16px;
  }
</style>
