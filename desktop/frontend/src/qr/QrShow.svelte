<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { backToChat, setMainRoute } from '../lib/state/mainRoute.svelte';
  import { onEvent } from '../lib/events';
  import Icon from '../lib/Icon.svelte';

  type Props = {
    /** When set, the QR is a group/broadcast invite for this chat. */
    chatId?: number | null;
  };

  let { chatId = null }: Props = $props();

  let svg = $state<string | null>(null);
  let url = $state<string | null>(null);
  let error = $state<string | null>(null);
  let copied = $state(false);
  let proxyEnabled = $state(false);

  async function refreshProxyState() {
    if (accounts.selectedId == null) return;
    try {
      const v = await rpc.call<string | null>('get_config', [accounts.selectedId, 'proxy_enabled']);
      proxyEnabled = v === '1';
    } catch {
      /* nothing — the icon just shows the outline form */
    }
  }

  onEvent('ConnectivityChanged', () => void refreshProxyState());

  function openProxySettings() {
    setMainRoute({ kind: 'settings', section: 'connectivity', subView: 'proxy' });
  }

  async function load() {
    if (accounts.selectedId == null) return;
    error = null;
    try {
      // Daemon returns (qr_url, svg_markup) — note the order is URL first.
      const [qrUrl, qrSvg] = await rpc.call<[string, string]>(
        'get_chat_securejoin_qr_code_svg',
        [accounts.selectedId, chatId],
      );
      url = qrUrl;
      svg = qrSvg;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  onMount(() => {
    void load();
    void refreshProxyState();
  });
  $effect(() => {
    void chatId;
    void load();
  });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard denied */
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && accounts.selectedId != null) {
        const obj = await rpc.call<{ kind: string }>('check_qr', [accounts.selectedId, text]);
        alert(`Scanned: ${obj.kind}`);
      }
    } catch (err) {
      alert(`Paste failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function withdraw() {
    if (!url || accounts.selectedId == null) return;
    if (!confirm('Withdraw this invite QR? Anyone holding it will no longer be able to join.')) {
      return;
    }
    try {
      await rpc.call('set_config_from_qr', [accounts.selectedId, url]);
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<section class="qr-show">
  <header class="topbar">
    <button class="back" onclick={backToChat} aria-label="Back">‹ Back</button>
    <h1>{chatId == null ? 'Your QR' : 'Group invite'}</h1>
  </header>

  <div class="body">
    {#if error}
      <p class="error">{error}</p>
    {:else if svg}
      <div class="card">
        <button
          class="proxy-shield"
          onclick={openProxySettings}
          aria-label={proxyEnabled ? 'Proxy on — open Proxy settings' : 'Open Proxy settings'}
          title={proxyEnabled ? 'Proxy: On' : 'Proxy: Off'}
        >
          <Icon name={proxyEnabled ? 'shield-fill' : 'shield'} size={20} />
        </button>
        <!-- daemon-trusted SVG; safe to render -->
        <div class="svg-wrap">{@html svg}</div>
        {#if url}
          <p class="url" title={url}>{url}</p>
        {/if}
        <div class="actions">
          <button onclick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
          <button onclick={paste}>Paste code</button>
          <button class="danger" onclick={withdraw}>Withdraw</button>
        </div>
      </div>
    {:else}
      <p class="hint">Generating QR…</p>
    {/if}
  </div>
</section>

<style>
  .qr-show {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
    min-height: 56px;
    flex: 0 0 auto;
  }
  .back {
    color: var(--color-accent);
    font-size: var(--text-md);
  }
  h1 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .card {
    position: relative;
    width: min(420px, 100%);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    box-shadow: 0 8px 24px var(--color-shadow);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .proxy-shield {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    background: transparent;
    color: var(--color-accent);
    padding: 4px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .proxy-shield:hover {
    background: var(--color-bg-hover);
  }
  .svg-wrap {
    width: 280px;
    height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .svg-wrap :global(svg) {
    width: 100%;
    height: 100%;
  }
  .url {
    font-size: var(--text-xs);
    color: var(--color-fg-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    /* Defensive: even if a future deltachat-core lengthens the QR payload,
     * keep the row from pushing the card wider than it should be. */
    min-width: 0;
    word-break: break-all;
  }
  .actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    justify-content: center;
  }
  .actions button {
    padding: 8px 14px;
    border-radius: var(--radius-md);
    background: var(--color-bg-hover);
    color: var(--color-fg);
    font-weight: 500;
  }
  .actions button:hover {
    background: var(--color-border);
  }
  .actions .danger {
    color: var(--color-danger);
  }
  .hint {
    color: var(--color-fg-secondary);
    margin-top: var(--space-5);
  }
  .error {
    color: var(--color-danger);
    text-align: center;
  }
</style>
