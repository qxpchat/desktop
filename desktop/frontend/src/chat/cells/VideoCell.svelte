<script lang="ts">
  import type { Message } from '../../lib/state/chat.svelte';
  import { fileUrl } from '../../lib/files';

  type Props = {
    message: Message;
  };

  let { message }: Props = $props();

  let url = $derived(fileUrl(message.file ?? undefined));
</script>

{#if url}
  <video controls preload="metadata" src={url} class="video">
    <track kind="captions" />
  </video>
{:else}
  <div class="missing">Video missing — try downloading</div>
{/if}

<style>
  .video {
    display: block;
    width: 100%;
    max-height: 50vh;
    border-radius: 0;
    background: #000;
  }
  .missing {
    padding: 12px;
    background: var(--color-bg-hover);
    color: var(--color-fg-tertiary);
  }
</style>
