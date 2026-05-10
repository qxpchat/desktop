<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { onEvent } from '../lib/events';

  let proxyEnabled = $state(false);
  let proxyUrls = $state<string[]>([]);
  let connectivity = $state<number>(0);
  let connectivityHtml = $state<string | null>(null);
  let loaded = $state(false);

  function connectivityLabel(c: number): string {
    if (c < 1000) return 'Not connected';
    if (c < 2000) return 'Connecting…';
    if (c < 3000) return 'Updating…';
    return 'Connected';
  }

  let label = $derived(connectivityLabel(connectivity));

  onMount(load);

  async function load() {
    if (accounts.selectedId == null) return;
    const id = accounts.selectedId;
    try {
      const [enabled, urlsRaw, conn] = await Promise.all([
        rpc.call<string | null>('get_config', [id, 'proxy_enabled']),
        rpc.call<string | null>('get_config', [id, 'proxy_url']),
        rpc.call<number>('get_connectivity', [id]),
      ]);
      proxyEnabled = enabled === '1';
      proxyUrls = (urlsRaw ?? '').split('\n').filter(Boolean);
      connectivity = conn;
    } finally {
      loaded = true;
    }
  }

  async function refreshConnectivity() {
    if (accounts.selectedId == null) return;
    connectivity = await rpc.call<number>('get_connectivity', [accounts.selectedId]);
  }

  onEvent('ConnectivityChanged', () => void refreshConnectivity());

  async function showHtml() {
    if (accounts.selectedId == null) return;
    connectivityHtml = await rpc.call<string>('get_connectivity_html', [accounts.selectedId]);
  }

  async function setEnabled(v: boolean) {
    if (accounts.selectedId == null) return;
    proxyEnabled = v;
    await rpc.call('set_config', [accounts.selectedId, 'proxy_enabled', v ? '1' : '0']);
    await restartIo();
  }

  async function restartIo() {
    if (accounts.selectedId == null) return;
    try {
      await rpc.call('stop_io', [accounts.selectedId]);
      await rpc.call('start_io', [accounts.selectedId]);
    } catch (err) {
      console.warn('restart IO failed', err);
    }
  }

  async function addProxy() {
    const url = prompt('Proxy URL (e.g. socks5://user:pass@host:1080):');
    if (!url || accounts.selectedId == null) return;
    try {
      // checkQr / setConfigFromQr handle parsing of `proxy:` URIs and standard
      // socks5/http(s) URLs alike (per deltachat-core's Qr::Proxy variant).
      await rpc.call('set_config_from_qr', [accounts.selectedId, url]);
    } catch (err) {
      alert(`Invalid proxy: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    await load();
    if (proxyEnabled) await restartIo();
  }

  async function removeProxy(url: string) {
    if (accounts.selectedId == null) return;
    proxyUrls = proxyUrls.filter((u) => u !== url);
    await rpc.call('set_config', [accounts.selectedId, 'proxy_url', proxyUrls.join('\n')]);
    if (proxyEnabled) await restartIo();
  }
</script>

<h2>Relays</h2>

<div class="card status">
  <span class="dot" data-state={connectivity >= 3000 ? 'ok' : connectivity >= 1000 ? 'mid' : 'bad'}></span>
  <span class="label">{label}</span>
  <button class="link" onclick={showHtml}>Details…</button>
</div>

{#if connectivityHtml}
  <div class="card">
    <button onclick={() => (connectivityHtml = null)} class="link">Hide</button>
    <!-- daemon-trusted HTML; rendered inside a sandbox-style container -->
    <div class="conn-html">{@html connectivityHtml}</div>
  </div>
{/if}

{#if loaded}
  <div class="card">
    <label class="toggle">
      <input
        type="checkbox"
        checked={proxyEnabled}
        disabled={proxyUrls.length === 0}
        onchange={(e) => void setEnabled((e.currentTarget as HTMLInputElement).checked)}
      />
      <span>Use relay (proxy)</span>
    </label>
    <ul class="proxy-list">
      {#each proxyUrls as url (url)}
        <li>
          <span class="url">{url}</span>
          <button class="danger" onclick={() => void removeProxy(url)}>Remove</button>
        </li>
      {/each}
      {#if proxyUrls.length === 0}
        <li class="muted">No proxies configured.</li>
      {/if}
    </ul>
    <button class="primary" onclick={addProxy}>Add relay</button>
  </div>
{/if}

<style>
  h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-xl);
  }
  .card {
    max-width: 520px;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    margin-bottom: var(--space-3);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .dot[data-state='ok'] {
    background: #34c759;
  }
  .dot[data-state='mid'] {
    background: #ffcc00;
  }
  .dot[data-state='bad'] {
    background: #ff3b30;
  }
  .label {
    flex: 1;
    font-weight: 500;
  }
  .link {
    color: var(--color-accent);
    background: transparent;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: var(--space-3);
  }
  .proxy-list {
    margin: 0 0 var(--space-3) 0;
  }
  .proxy-list li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 6px 0;
    border-bottom: 1px solid var(--color-border);
  }
  .url {
    flex: 1;
    font-family: ui-monospace, monospace;
    font-size: var(--text-sm);
    word-break: break-all;
  }
  .danger {
    color: var(--color-danger);
    background: transparent;
  }
  .primary {
    padding: 6px 14px;
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
  }
  .muted {
    color: var(--color-fg-tertiary);
  }
  .conn-html :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }
  .conn-html :global(td) {
    padding: 4px 8px;
    border-bottom: 1px solid var(--color-border);
  }
</style>
