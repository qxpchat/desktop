<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { lightbox, closeLightbox } from '../lib/state/lightbox.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeLightbox();
  }

  onMount(() => {
    window.addEventListener('keydown', onKey);
  });
  onDestroy(() => {
    window.removeEventListener('keydown', onKey);
  });
</script>

{#if lightbox.item}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label={t('Image viewer')}
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeLightbox();
    }}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          closeLightbox();
        }
      }
    }}
  >
    {#if lightbox.item.kind === 'image'}
      <img src={lightbox.item.url} alt={lightbox.item.caption ?? ''} />
    {:else}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video src={lightbox.item.url} controls autoplay></video>
    {/if}
    {#if lightbox.item.caption}
      <div class="caption">{lightbox.item.caption}</div>
    {/if}
    <button class="close" onclick={closeLightbox} aria-label={t('Close')}>✕</button>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.92);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    z-index: var(--z-modal);
    cursor: zoom-out;
  }
  img,
  video {
    max-width: 100%;
    max-height: calc(100vh - 96px);
    border-radius: 4px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    cursor: default;
  }
  .caption {
    margin-top: 12px;
    color: rgba(255, 255, 255, 0.9);
    font-size: var(--text-sm);
    max-width: 80%;
    text-align: center;
    cursor: default;
  }
  .close {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    color: white;
    font-size: 16px;
    line-height: 1;
  }
  .close:hover {
    background: rgba(255, 255, 255, 0.3);
  }
</style>
