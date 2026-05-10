<script lang="ts">
  import type { Message } from '../../lib/state/chat.svelte';
  import { fileUrl } from '../../lib/files';
  import { openLightbox } from '../../lib/state/lightbox.svelte';

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
    openLightbox({
      url: url ?? '',
      kind: 'image',
      caption: message.text,
    });
  }
</script>

<button class="image" onclick={open} title="Open image" aria-label="Open image">
  {#if url}
    <img src={url} alt={message.fileName ?? 'image'} style:aspect-ratio={aspect} />
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
