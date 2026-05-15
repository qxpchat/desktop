<script lang="ts">
  // Ports `ios/qxp/Views/ProxySettingsView.swift`. The core stores proxies in
  // `proxy_url` as a newline-separated list; the head of that list is the
  // active proxy when `proxy_enabled=1`. `set_config_from_qr` is the
  // canonical "add or promote" path — it validates the URL (HTTPS / SOCKS5 /
  // Shadowsocks) and dedupes / re-orders.
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { onEvent } from '../lib/events';
  import Icon from '../lib/Icon.svelte';
  import SettingsSection from '../lib/SettingsSection.svelte';
  import SettingsRow from '../lib/SettingsRow.svelte';
  import Toggle from '../lib/Toggle.svelte';
  import Modal from '../lib/Modal.svelte';
  import Button from '../lib/Button.svelte';
  import ShareProxy from './ShareProxy.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onBack: () => void;
    proxyEnabled: boolean;
  };

  let { onBack, proxyEnabled = $bindable() }: Props = $props();

  let proxies = $state<string[]>([]);
  let hosts = $state<Record<string, string>>({});
  let connectivity = $state(0);
  let busy = $state(false);
  let errorMsg = $state<string | null>(null);

  let addOpen = $state(false);
  let addValue = $state('');
  let removeTarget = $state<string | null>(null);
  let shareTarget = $state<string | null>(null);

  onMount(load);

  async function load() {
    if (accounts.selectedId == null) return;
    const id = accounts.selectedId;
    try {
      const [rawUrls, enabled, conn] = await Promise.all([
        rpc.call<string | null>('get_config', [id, 'proxy_url']),
        rpc.call<string | null>('get_config', [id, 'proxy_enabled']),
        rpc.call<number>('get_connectivity', [id]),
      ]);
      proxies = (rawUrls ?? '').split('\n').filter(Boolean);
      proxyEnabled = enabled === '1';
      connectivity = conn;
      await resolveHosts();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
  }

  // `check_qr` exposes the parsed `host` for proxy URLs; same field the
  // QrDispatcher uses. Cache one host lookup per URL. Parallel since
  // `check_qr` is parser-level and side-effect-free.
  async function resolveHosts() {
    if (accounts.selectedId == null) return;
    const id = accounts.selectedId;
    const pairs = await Promise.all(
      proxies.map(async (url) => {
        try {
          const obj = await rpc.call<{ kind: string; host?: string }>('check_qr', [id, url]);
          return [url, obj.host ?? url] as const;
        } catch {
          return [url, url] as const;
        }
      }),
    );
    hosts = Object.fromEntries(pairs);
  }

  onEvent('ConnectivityChanged', () => void load());

  // `proxy_enabled` doesn't auto-restart IO; deltachat-ios and iOS qxp both
  // call `restart_io` after toggling. We compose stop_io → start_io since
  // there's no `restart_io` JSON-RPC.
  async function restartIo() {
    if (accounts.selectedId == null) return;
    try {
      await rpc.call('stop_io', [accounts.selectedId]);
      await rpc.call('start_io', [accounts.selectedId]);
    } catch (err) {
      console.warn('restart IO failed', err);
    }
  }

  async function setEnabled(v: boolean) {
    if (accounts.selectedId == null || proxies.length === 0) return;
    busy = true;
    errorMsg = null;
    try {
      await rpc.call('set_config', [accounts.selectedId, 'proxy_enabled', v ? '1' : '0']);
      proxyEnabled = v;
      await restartIo();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  // Promote a saved proxy to head. `set_config_from_qr` dedupes and
  // re-orders, so passing an existing URL has the desired effect.
  async function select(url: string) {
    if (accounts.selectedId == null) return;
    busy = true;
    errorMsg = null;
    try {
      await rpc.call('set_config_from_qr', [accounts.selectedId, url]);
      await load();
      await restartIo();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function openAdd() {
    addValue = '';
    errorMsg = null;
    addOpen = true;
  }

  async function submitAdd() {
    if (accounts.selectedId == null) return;
    const url = addValue.trim();
    if (!url) return;
    busy = true;
    errorMsg = null;
    try {
      // Validate first — `check_qr` rejects anything that isn't a proxy URL.
      const obj = await rpc.call<{ kind: string }>('check_qr', [accounts.selectedId, url]);
      if (obj.kind !== 'proxy') {
        throw new Error('Not a supported proxy URL.');
      }
      await rpc.call('set_config_from_qr', [accounts.selectedId, url]);
      addOpen = false;
      addValue = '';
      await load();
      await restartIo();
    } catch (err) {
      errorMsg = `Invalid proxy: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      busy = false;
    }
  }

  async function confirmRemove() {
    if (!removeTarget || accounts.selectedId == null) return;
    const url = removeTarget;
    removeTarget = null;
    busy = true;
    errorMsg = null;
    try {
      const wasActive = proxies[0] === url;
      const next = proxies.filter((u) => u !== url);
      if (wasActive) {
        await rpc.call('set_config', [accounts.selectedId, 'proxy_enabled', '0']);
        proxyEnabled = false;
      }
      await rpc.call('set_config', [accounts.selectedId, 'proxy_url', next.join('\n')]);
      await load();
      await restartIo();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function scheme(url: string): string {
    return (url.split(':')[0] ?? '').toUpperCase();
  }

  function connectionLabel(): string {
    if (!proxyEnabled) return t('Not connected');
    if (connectivity >= 4000) return t('Connected');
    if (connectivity >= 3000) return t('Updating…');
    if (connectivity >= 2000) return t('Connecting…');
    return t('Not connected');
  }
</script>

<header class="topbar">
  <button class="back" onclick={onBack}>
    <Icon name="chevron-left" size={16} /> {t('Connectivity')}
  </button>
  <h2>{t('Proxy')}</h2>
</header>

<SettingsSection>
  <SettingsRow label={t('Use Proxy')} right={useProxyToggle} />
</SettingsSection>

{#snippet useProxyToggle()}
  <Toggle
    checked={proxyEnabled}
    disabled={proxies.length === 0 || busy}
    onChange={(v) => void setEnabled(v)}
    label={t('Use Proxy')}
  />
{/snippet}

{#if proxies.length > 0}
  <SettingsSection title={t('Saved Proxies')}>
    {#each proxies as url, idx (url)}
      {@const isActive = idx === 0}
      <div class="proxy">
        <button class="proxy-main" disabled={busy} onclick={() => void select(url)}>
          <div class="head">
            <span class="host">{hosts[url] ?? url}</span>
            {#if isActive}
              <Icon name="check" size={14} stroke={2.5} />
            {/if}
          </div>
          <div class="meta">
            <span class="scheme">{scheme(url)}</span>
            {#if isActive}
              <span>{connectionLabel()}</span>
            {/if}
          </div>
        </button>
        <div class="row-actions">
          <button class="link" disabled={busy} onclick={() => (shareTarget = url)}>{t('Share')}</button>
          <button class="link link-danger" disabled={busy} onclick={() => (removeTarget = url)}>
            {t('Delete')}
          </button>
        </div>
      </div>
    {/each}
  </SettingsSection>
{/if}

<SettingsSection>
  <SettingsRow label={t('Add Proxy')} icon="plus" onClick={openAdd} />
</SettingsSection>

{#if errorMsg}
  <p class="error">{errorMsg}</p>
{/if}

<Modal open={addOpen} onClose={() => (addOpen = false)} size="md">
  <div class="dialog-body">
    <h3>{t('Add Proxy')}</h3>
    <p>{t('Supported proxy types: HTTP(S), SOCKS5 and Shadowsocks.')}</p>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="url"
      bind:value={addValue}
      placeholder="socks5://user:pass@host:1080"
      autofocus
      spellcheck="false"
      autocapitalize="off"
      autocorrect="off"
    />
    <div class="actions">
      <Button variant="secondary" onclick={() => (addOpen = false)} disabled={busy}>{t('Cancel')}</Button>
      <Button variant="primary" onclick={submitAdd} disabled={busy || !addValue.trim()}>
        {busy ? t('Adding…') : t('Use Proxy')}
      </Button>
    </div>
  </div>
</Modal>

<Modal open={removeTarget != null} onClose={() => (removeTarget = null)} size="sm" role="alertdialog">
  {#if removeTarget}
    {@const r = removeTarget}
    <div class="dialog-body">
      <h3>{t('Delete proxy "{name}"?', { name: hosts[r] ?? r })}</h3>
      <div class="actions">
        <Button variant="secondary" onclick={() => (removeTarget = null)} disabled={busy}>{t('Cancel')}</Button>
        <Button variant="danger" onclick={confirmRemove} disabled={busy}>
          {busy ? t('Deleting…') : t('Delete Proxy')}
        </Button>
      </div>
    </div>
  {/if}
</Modal>

{#if shareTarget}
  <ShareProxy url={shareTarget} onClose={() => (shareTarget = null)} />
{/if}

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .back {
    color: var(--color-accent);
    background: transparent;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: var(--text-md);
  }
  h2 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .proxy {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 8px 0;
  }
  .proxy + .proxy {
    border-top: 1px solid var(--color-border);
  }
  .proxy-main {
    flex: 1;
    min-width: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    /* Reset is `align-items: center; justify-content: center`. In a flex
     * column the cross-axis is horizontal and main-axis is vertical, so
     * both default to centered — push the host/scheme/state to the
     * top-left corner instead. */
    align-items: flex-start;
    justify-content: flex-start;
    gap: 2px;
  }
  .proxy-main:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .host {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
  }
  .scheme {
    border: 1px solid var(--color-fg-tertiary);
    border-radius: 3px;
    padding: 1px 4px;
    color: var(--color-fg-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .row-actions {
    display: flex;
    gap: var(--space-3);
    flex: 0 0 auto;
  }
  .link {
    background: transparent;
    color: var(--color-accent);
    font-size: var(--text-sm);
  }
  .link:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .link-danger {
    color: var(--color-danger);
  }
  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
    margin: var(--space-3) 0;
  }

  .dialog-body {
    padding: var(--space-5);
  }
  .dialog-body h3 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .dialog-body p {
    margin: 0 0 var(--space-3) 0;
    color: var(--color-fg-secondary);
  }
  .dialog-body input {
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 var(--space-4) 0;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }
  .dialog-body input:focus {
    outline: none;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
