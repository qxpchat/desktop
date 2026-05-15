<script lang="ts">
  import type { Message } from '../../lib/state/chat.svelte';
  import { fileUrl, formatBytes } from '../../lib/files';
  import Icon from '../../lib/Icon.svelte';

  type Props = {
    message: Message;
  };

  let { message }: Props = $props();

  let url = $derived(fileUrl(message.file ?? undefined));
  let displayName = $derived(message.fileName ?? 'file');
</script>

<a class="file" href={url ?? '#'} download={displayName} target="_blank" rel="noopener">
  <span class="action" aria-hidden="true">
    <Icon name="download" size={16} stroke={2} />
  </span>
  <span class="meta">
    <span class="name">{displayName}</span>
    <span class="size">{formatBytes(message.fileBytes)}</span>
  </span>
</a>
{#if message.text}
  <div class="caption">{message.text}</div>
{/if}

<style>
  .file {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: var(--color-bg-hover);
    border-radius: 12px;
    text-decoration: none;
    color: inherit;
    max-width: 320px;
  }
  .file:hover {
    background: var(--color-border);
  }
  /* Mirrors `.play` in VoiceCell — circular accent puck so the affordance
   * for "tap to start" reads the same whether it's playback or download. */
  .action {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .size {
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
  }
  .caption {
    margin-top: 6px;
    white-space: pre-wrap;
  }
</style>
