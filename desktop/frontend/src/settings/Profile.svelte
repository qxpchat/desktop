<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { refreshProfiles } from '../lib/state/profiles.svelte';
  import { fileUrl } from '../lib/files';

  let displayName = $state('');
  let signature = $state('');
  let avatarPath = $state<string | null>(null);
  let saving = $state(false);
  let savedAt = $state(0);
  let loaded = $state(false);

  onMount(load);

  async function load() {
    if (accounts.selectedId == null) return;
    try {
      const id = accounts.selectedId;
      const [name, sig, avatar] = await Promise.all([
        rpc.call<string | null>('get_config', [id, 'displayname']),
        rpc.call<string | null>('get_config', [id, 'selfstatus']),
        rpc.call<string | null>('get_config', [id, 'selfavatar']),
      ]);
      displayName = name ?? '';
      signature = sig ?? '';
      avatarPath = avatar ?? null;
    } finally {
      loaded = true;
    }
  }

  async function save() {
    if (accounts.selectedId == null) return;
    const id = accounts.selectedId;
    saving = true;
    try {
      await rpc.call('set_config', [id, 'displayname', displayName]);
      await rpc.call('set_config', [id, 'selfstatus', signature]);
      await refreshProfiles(accounts.configuredIds);
      savedAt = Date.now();
    } finally {
      saving = false;
    }
  }

  let recentlySaved = $derived(savedAt > 0 && Date.now() - savedAt < 2000);
</script>

<h2>Profile</h2>

{#if !loaded}
  <p class="muted">Loading…</p>
{:else}
  <div class="row">
    <span class="avatar">
      {#if avatarPath}
        <img src={fileUrl(avatarPath)} alt="Profile avatar" />
      {:else}
        {(displayName[0] ?? '?').toUpperCase()}
      {/if}
    </span>
  </div>

  <label class="field">
    <span class="label">Display name</span>
    <input bind:value={displayName} />
  </label>

  <label class="field">
    <span class="label">Signature (status)</span>
    <textarea bind:value={signature} rows="3"></textarea>
  </label>

  <div class="actions">
    <button class="primary" onclick={save} disabled={saving}>
      {saving ? 'Saving…' : recentlySaved ? 'Saved ✓' : 'Save'}
    </button>
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
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--color-bg-hover);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 600;
    overflow: hidden;
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .field {
    display: block;
    margin-bottom: var(--space-3);
    max-width: 480px;
  }
  .label {
    display: block;
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
    font-weight: 500;
    margin-bottom: 2px;
  }
  .field input,
  .field textarea {
    width: 100%;
    padding: 8px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: inherit;
    font-size: var(--text-md);
  }
  .field input:focus,
  .field textarea:focus {
    border-color: var(--color-accent);
    outline: none;
  }
  .actions {
    margin-top: var(--space-3);
  }
  .primary {
    padding: 8px 16px;
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
  }
  .primary:disabled {
    opacity: 0.6;
  }
</style>
