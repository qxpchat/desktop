<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { refreshProfiles, profiles } from '../lib/state/profiles.svelte';
  import Avatar from '../lib/Avatar.svelte';

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
  <div class="avatar-wrap">
    <Avatar
      name={displayName}
      color={profiles.list.find((p) => p.id === accounts.selectedId)?.color ?? 'var(--color-accent)'}
      imagePath={avatarPath}
      size={96}
      alt="Profile avatar"
    />
  </div>

  <label class="field">
    <span class="field-label">Display name</span>
    <input bind:value={displayName} placeholder="Your name" />
  </label>

  <label class="field">
    <span class="field-label">Signature</span>
    <textarea bind:value={signature} rows="3" placeholder="Shown in your contact info"></textarea>
  </label>

  <div class="actions">
    <button class="primary" onclick={save} disabled={saving}>
      {saving ? 'Saving…' : recentlySaved ? 'Saved' : 'Save'}
    </button>
  </div>
{/if}

<style>
  h2 {
    margin: 0 0 var(--space-5) 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .muted {
    color: var(--color-fg-tertiary);
  }
  .avatar-wrap {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-5);
  }
  .field {
    display: block;
    margin-bottom: var(--space-4);
    max-width: 480px;
  }
  .field-label {
    display: block;
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
    margin-bottom: 6px;
  }
  .field input,
  .field textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: inherit;
    font-size: var(--text-md);
    resize: vertical;
  }
  .field input:focus,
  .field textarea:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: -1px;
    border-color: transparent;
  }
  .actions {
    margin-top: var(--space-4);
    max-width: 480px;
    display: flex;
    justify-content: flex-end;
  }
  .primary {
    height: 36px;
    padding: 0 var(--space-5);
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
  }
  .primary:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
