<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';

  // Subset of deltachat config keys this section manages.
  let mdnsEnabled = $state(false);
  let mediaQuality = $state('0'); // 0 = balanced, 1 = high
  let downloadLimit = $state('0'); // bytes; 0 = unlimited
  let deleteDeviceAfter = $state('0'); // seconds
  let deleteServerAfter = $state('0'); // seconds
  let deviceCount = $state<number | null>(null);
  let serverCount = $state<number | null>(null);
  let loaded = $state(false);

  onMount(load);

  async function load() {
    if (accounts.selectedId == null) return;
    const id = accounts.selectedId;
    try {
      const [mdns, mq, dl, dda, dsa] = await Promise.all([
        rpc.call<string | null>('get_config', [id, 'mdns_enabled']),
        rpc.call<string | null>('get_config', [id, 'media_quality']),
        rpc.call<string | null>('get_config', [id, 'download_limit']),
        rpc.call<string | null>('get_config', [id, 'delete_device_after']),
        rpc.call<string | null>('get_config', [id, 'delete_server_after']),
      ]);
      mdnsEnabled = mdns === '1';
      mediaQuality = mq ?? '0';
      downloadLimit = dl ?? '0';
      deleteDeviceAfter = dda ?? '0';
      deleteServerAfter = dsa ?? '0';
    } finally {
      loaded = true;
    }
  }

  async function setMdns(value: boolean) {
    if (accounts.selectedId == null) return;
    mdnsEnabled = value;
    await rpc.call('set_config', [accounts.selectedId, 'mdns_enabled', value ? '1' : '0']);
  }

  async function setKey(key: string, value: string) {
    if (accounts.selectedId == null) return;
    await rpc.call('set_config', [accounts.selectedId, key, value]);
  }

  async function previewDeleteDevice() {
    if (accounts.selectedId == null) return;
    deviceCount = await rpc
      .call<number>('estimate_auto_deletion_count', [
        accounts.selectedId,
        false,
        Number(deleteDeviceAfter),
      ])
      .catch(() => 0);
  }
  async function previewDeleteServer() {
    if (accounts.selectedId == null) return;
    serverCount = await rpc
      .call<number>('estimate_auto_deletion_count', [
        accounts.selectedId,
        true,
        Number(deleteServerAfter),
      ])
      .catch(() => 0);
  }
</script>

<h2>Chats & Media</h2>

{#if !loaded}
  <p class="muted">Loading…</p>
{:else}
  <label class="toggle">
    <input type="checkbox" checked={mdnsEnabled} onchange={(e) => setMdns((e.currentTarget as HTMLInputElement).checked)} />
    <span>Send read receipts</span>
  </label>

  <div class="field">
    <span class="label">Media quality</span>
    <select bind:value={mediaQuality} onchange={() => setKey('media_quality', mediaQuality)}>
      <option value="0">Balanced</option>
      <option value="1">High</option>
    </select>
  </div>

  <div class="field">
    <span class="label">Auto-download size limit (bytes; 0 = unlimited)</span>
    <input
      type="number"
      bind:value={downloadLimit}
      onchange={() => setKey('download_limit', downloadLimit)}
    />
  </div>

  <div class="field">
    <span class="label">Auto-delete from device after (seconds; 0 = never)</span>
    <div class="inline">
      <input
        type="number"
        bind:value={deleteDeviceAfter}
        onchange={() => setKey('delete_device_after', deleteDeviceAfter)}
      />
      <button onclick={previewDeleteDevice}>Preview count</button>
    </div>
    {#if deviceCount != null}
      <p class="hint">Would affect {deviceCount} message{deviceCount === 1 ? '' : 's'}.</p>
    {/if}
  </div>

  <div class="field">
    <span class="label">Auto-delete from server after (seconds; 0 = never)</span>
    <div class="inline">
      <input
        type="number"
        bind:value={deleteServerAfter}
        onchange={() => setKey('delete_server_after', deleteServerAfter)}
      />
      <button onclick={previewDeleteServer}>Preview count</button>
    </div>
    {#if serverCount != null}
      <p class="hint">Would affect {serverCount} message{serverCount === 1 ? '' : 's'}.</p>
    {/if}
  </div>
{/if}

<style>
  h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-xl);
  }
  .muted {
    color: var(--color-fg-tertiary);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: var(--space-3);
  }
  .field {
    margin-bottom: var(--space-4);
    max-width: 520px;
  }
  .label {
    display: block;
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
    font-weight: 500;
    margin-bottom: 4px;
  }
  .field input,
  .field select {
    padding: 8px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    font-size: var(--text-md);
    font-family: inherit;
  }
  .inline {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .inline button {
    padding: 8px 12px;
    border-radius: var(--radius-md);
    background: var(--color-bg-hover);
    color: var(--color-fg);
    font-weight: 500;
  }
  .inline button:hover {
    background: var(--color-border);
  }
  .hint {
    margin-top: 4px;
    color: var(--color-fg-tertiary);
    font-size: var(--text-sm);
  }
</style>
