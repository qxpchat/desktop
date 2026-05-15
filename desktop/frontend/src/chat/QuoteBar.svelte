<script lang="ts">
  import type { Message } from '../lib/state/chat.svelte';
  import { t } from '../lib/i18n/i18n.svelte';
  import IconButton from '../lib/IconButton.svelte';

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
    if (mode === 'edit') return t('Editing message');
    return target.sender?.displayName || target.overrideSenderName || t('Reply');
  });

  let preview = $derived.by(() => {
    if (!target) return '';
    if (target.text) return target.text;
    switch (target.viewType) {
      case 'Image':
      case 'Gif':
        return `🖼 ${t('Image')}`;
      case 'Video':
        return `🎞 ${t('Video')}`;
      case 'Audio':
      case 'Voice':
        return `🎤 ${t('Voice')}`;
      case 'File':
        return `📎 ${t('File')}`;
      case 'Vcard':
        return `👤 ${t('Contact')}`;
      default:
        return '';
    }
  });
</script>

{#if target}
  <div class="quote-bar" class:edit={mode === 'edit'} data-testid="composer__quote-bar" data-mode={mode}>
    <span class="bar-color" aria-hidden="true"></span>
    <div class="content">
      <span class="label">{label}</span>
      <span class="preview">{preview}</span>
    </div>
    <IconButton
      variant="subtle"
      size={28}
      icon="x"
      label={t('Cancel')}
      onclick={onClose}
      data-testid="composer__quote-bar-close"
    />
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
</style>
