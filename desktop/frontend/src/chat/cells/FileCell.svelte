<script lang="ts">
  import type { Message } from '../../lib/state/chat.svelte';
  import { fileUrl, formatBytes } from '../../lib/files';

  type Props = {
    message: Message;
  };

  let { message }: Props = $props();

  let url = $derived(fileUrl(message.file ?? undefined));
  let displayName = $derived(message.fileName ?? 'file');
  let extension = $derived(displayName.split('.').pop()?.toUpperCase() ?? '?');
</script>

<a class="file" href={url ?? '#'} download={displayName} target="_blank" rel="noopener">
  <span class="icon" aria-hidden="true">{extension.slice(0, 4)}</span>
  <span class="meta">
    <span class="name">{displayName}</span>
    <span class="size">{formatBytes(message.fileBytes)}</span>
  </span>
  <span class="dl" aria-hidden="true">↓</span>
</a>
{#if message.text}
  <div class="caption">{message.text}</div>
{/if}

<style>
  .file {
    display: flex;
    align-items: center;
    gap: 12px;
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
  .icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--color-bg-elevated);
    color: var(--color-fg-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
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
  .dl {
    color: var(--color-accent);
    font-weight: 700;
    flex: 0 0 auto;
  }
  .caption {
    margin-top: 6px;
    white-space: pre-wrap;
  }
</style>
