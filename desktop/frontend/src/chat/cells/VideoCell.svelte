<script lang="ts">
  import type { Message } from '../../lib/state/chat.svelte';
  import { fileUrl } from '../../lib/files';
  import { t } from '../../lib/i18n/i18n.svelte';

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
  <div class="missing">{t('Video missing — try downloading')}</div>
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
