<script lang="ts">
  import type { PendingAttachment } from '../lib/state/chat.svelte';
  import Icon, { type IconName } from '../lib/Icon.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    attachment: PendingAttachment;
    onClose: () => void;
  };

  let { attachment, onClose }: Props = $props();

  function iconFor(viewtype: string): IconName {
    switch (viewtype) {
      case 'Video':
        return 'play';
      case 'Audio':
        return 'music';
      case 'Voice':
        return 'mic';
      default:
        return 'file';
    }
  }

  function labelFor(viewtype: string): string {
    switch (viewtype) {
      case 'Image':
        return t('Image');
      case 'Gif':
        return t('GIF');
      case 'Video':
        return t('Video');
      case 'Audio':
        return t('Audio');
      case 'Voice':
        return t('Voice');
      default:
        return t('Attachment');
    }
  }

  let label = $derived(labelFor(attachment.viewtype));

  // Fall back to the type icon if the thumbnail fails to load — e.g. a drop
  // from outside the asset-protocol scope, or a file moved after the drop.
  let thumbBroken = $state(false);
  $effect(() => {
    attachment.previewUrl;
    thumbBroken = false;
  });
</script>

<div class="attachment-bar" data-testid="composer__attachment-bar">
  {#if attachment.previewUrl && !thumbBroken}
    <img
      class="thumb"
      src={attachment.previewUrl}
      alt=""
      onerror={() => (thumbBroken = true)}
    />
  {:else}
    <span class="icon" aria-hidden="true">
      <Icon name={iconFor(attachment.viewtype)} size={18} />
    </span>
  {/if}
  <div class="content">
    <span class="label">{label}</span>
    <span class="filename">{attachment.filename}</span>
  </div>
  <button
    class="close"
    onclick={onClose}
    aria-label={t('Cancel')}
    data-testid="composer__attachment-bar-close"
  >
    <Icon name="x" size={16} />
  </button>
</div>

<style>
  .attachment-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
  }
  .thumb {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: var(--radius-sm);
    flex: 0 0 auto;
  }
  .icon {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: var(--color-bg-hover);
    color: var(--color-fg-secondary);
    flex: 0 0 auto;
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
  .filename {
    font-size: var(--text-sm);
    color: var(--color-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-fg-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
  .close:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
</style>
