<script lang="ts">
  // Ports `ios/qxp/Views/ShareProxyView.swift`. Renders the saved proxy URL
  // as a QR code via the core's `create_qr_svg` (no frontend QR encoder
  // dependency, same trick QrShow.svelte uses for chat invites). The Copy
  // Link button replaces iOS's native Share sheet — desktop has no
  // share-to-app surface.
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import Icon from '../lib/Icon.svelte';
  import Modal from '../lib/Modal.svelte';
  import Button from '../lib/Button.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    url: string;
    onClose: () => void;
  };

  let { url, onClose }: Props = $props();

  let svg = $state<string | null>(null);
  let error = $state<string | null>(null);
  let copied = $state(false);

  onMount(async () => {
    try {
      svg = await rpc.call<string>('create_qr_svg', [url]);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      error = t('Could not copy to clipboard.');
    }
  }
</script>

<Modal open={true} {onClose} size="md" ariaLabel={t('Share Proxy')}>
  <div class="dialog-body">
    <header class="head">
      <h3>{t('Share Proxy')}</h3>
      <button class="close" onclick={onClose} aria-label={t('Done')}><Icon name="x" size={16} /></button>
    </header>

    <div class="body">
      {#if svg}
        <div class="qr">{@html svg}</div>
      {:else if error}
        <p class="error">{error}</p>
      {:else}
        <div class="qr-placeholder"></div>
      {/if}

      <p class="hint">{t('Your friends can add this proxy by scanning the QR code.')}</p>

      <code class="url">{url}</code>

      <Button variant="primary" onclick={copyLink}>
        <Icon name="copy" size={14} />
        {copied ? t('Copied') : t('Copy Link')}
      </Button>
    </div>
  </div>
</Modal>

<style>
  .dialog-body {
    padding: var(--space-5);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  h3 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .close {
    background: transparent;
    color: var(--color-fg-tertiary);
    padding: 4px;
    border-radius: var(--radius-sm);
  }
  .close:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .qr {
    max-width: 260px;
    width: 100%;
    aspect-ratio: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border-radius: var(--radius-md);
    padding: var(--space-3);
    box-sizing: border-box;
  }
  .qr :global(svg) {
    width: 100%;
    height: 100%;
  }
  .qr-placeholder {
    max-width: 260px;
    width: 100%;
    aspect-ratio: 1 / 1;
    background: var(--color-bg-hover);
    border-radius: var(--radius-md);
  }
  .hint {
    margin: 0;
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
    text-align: center;
  }
  .url {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    color: var(--color-fg-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    word-break: break-all;
    text-align: center;
  }
  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
