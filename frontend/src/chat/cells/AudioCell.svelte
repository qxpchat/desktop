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
  <audio controls preload="metadata" src={url} class="audio"></audio>
{/if}
{#if message.text}
  <div class="caption">{message.text}</div>
{/if}

<style>
  .audio {
    display: block;
    width: 280px;
    max-width: 100%;
  }
  .caption {
    margin-top: 6px;
    white-space: pre-wrap;
  }
</style>
