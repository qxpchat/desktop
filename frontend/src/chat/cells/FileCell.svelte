<script lang="ts">
  import type { Message } from '../../lib/state/chat.svelte';
  import { fileUrl, formatBytes } from '../../lib/files';
  import Icon from '../../lib/Icon.svelte';

  type Props = {
    message: Message;
    /** Tile colour triple — see MessageBubble. `bg` is the bubble fill
     *  behind the tile (also the puck-icon colour), `accent` fills the puck. */
    bg: string;
    fg: string;
    accent: string;
  };

  let { message, bg, fg, accent }: Props = $props();

  let url = $derived(fileUrl(message.file ?? undefined));
  let displayName = $derived(message.fileName ?? 'file');
</script>

<a
  class="file"
  href={url ?? '#'}
  download={displayName}
  target="_blank"
  rel="noopener"
  style:--cell-bg={bg}
  style:--cell-fg={fg}
  style:--cell-accent={accent}
>
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
    text-decoration: none;
    color: var(--cell-fg);
    max-width: 320px;
  }
  .file:hover .name {
    text-decoration: underline;
  }
  /* Mirrors `.play` in VoiceCell — circular accent puck so the affordance
   * for "tap to start" reads the same whether it's playback or download.
   * The icon takes the bubble fill (`--cell-bg`) so it reads as a cutout. */
  .action {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--cell-accent);
    color: var(--cell-bg);
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
    color: color-mix(in srgb, var(--cell-fg) 58%, transparent);
  }
  .caption {
    margin-top: 6px;
    white-space: pre-wrap;
  }
</style>
