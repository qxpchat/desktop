<script lang="ts">
  import type { Message } from '../lib/state/chat.svelte';

  type Props = {
    /** Message being quoted/edited (or null = no bar). */
    target: Message | null;
    /** 'reply' renders an arrow + author; 'edit' renders a pencil + "Editing message". */
    mode: 'reply' | 'edit';
    onClose: () => void;
  };

  let { target, mode, onClose }: Props = $props();

  let label = $derived.by(() => {
    if (!target) return '';
    if (mode === 'edit') return 'Editing message';
    return target.sender?.displayName || target.overrideSenderName || 'Reply';
  });

  let preview = $derived.by(() => {
    if (!target) return '';
    if (target.text) return target.text;
    switch (target.viewType) {
      case 'Image':
      case 'Gif':
        return '🖼 Image';
      case 'Video':
        return '🎞 Video';
      case 'Audio':
      case 'Voice':
        return '🎤 Voice';
      case 'File':
        return '📎 File';
      case 'Vcard':
        return '👤 Contact';
      default:
        return '';
    }
  });
</script>

{#if target}
  <div class="quote-bar" class:edit={mode === 'edit'}>
    <span class="bar-color" aria-hidden="true"></span>
    <div class="content">
      <span class="label">{label}</span>
      <span class="preview">{preview}</span>
    </div>
    <button class="close" onclick={onClose} aria-label="Cancel">✕</button>
  </div>
{/if}

<style>
  .quote-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 0;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
  }
  .bar-color {
    width: 3px;
    align-self: stretch;
    background: var(--color-accent);
    border-radius: 2px;
    margin-left: 8px;
  }
  .quote-bar.edit .bar-color {
    background: var(--color-accent);
  }
  .content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .label {
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--color-accent);
  }
  .preview {
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-fg-secondary);
  }
  .close:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
</style>
