<script lang="ts">
  import type { Message } from '../../lib/state/chat.svelte';
  import { fileUrl } from '../../lib/files';
  import { openLightbox } from '../../lib/state/lightbox.svelte';
  import { t } from '../../lib/i18n/i18n.svelte';

  type Props = {
    message: Message;
  };

  let { message }: Props = $props();

  let url = $derived(fileUrl(message.file ?? undefined));
  let aspect = $derived.by(() => {
    if (message.dimensionsWidth > 0 && message.dimensionsHeight > 0) {
      return `${message.dimensionsWidth} / ${message.dimensionsHeight}`;
    }
    return '4 / 3';
  });

  function open() {
    void openLightbox({
      url: url ?? '',
      kind: 'image',
      caption: message.text,
      msgId: message.id,
      timestamp: message.timestamp,
      fileName: message.fileName ?? undefined,
    });
  }
</script>

<button class="image" onclick={open} title={t('Open image')} aria-label={t('Open image')} data-testid="image-cell">
  {#if url}
    <img src={url} alt={message.fileName ?? t('image')} style:aspect-ratio={aspect} />
  {/if}
</button>

<style>
  .image {
    display: block;
    padding: 0;
    background: transparent;
    width: 100%;
    border-radius: 0;
  }
  .image img {
    display: block;
    width: 100%;
    /* Cap inline image at half the viewport height so a tall photo doesn't
     * dominate the conversation. Click-to-zoom in the lightbox handles full
     * size when the user wants it. */
    max-height: 50vh;
    object-fit: cover;
    background: var(--color-bg-hover);
    border-radius: 0;
  }
</style>
