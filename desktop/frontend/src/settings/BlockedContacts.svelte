<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';

  type Contact = {
    id: number;
    displayName: string;
    address: string;
    color: string;
  };

  let list = $state<Contact[]>([]);
  let loading = $state(true);

  onMount(load);

  async function load() {
    if (accounts.selectedId == null) return;
    loading = true;
    try {
      list = await rpc.call<Contact[]>('get_blocked_contacts', [accounts.selectedId]);
    } finally {
      loading = false;
    }
  }

  async function unblock(id: number) {
    if (accounts.selectedId == null) return;
    await rpc.call('block_contact', [accounts.selectedId, id, false]);
    await load();
  }
</script>

<h2>Blocked contacts</h2>

{#if loading}
  <p class="muted">Loading…</p>
{:else if list.length === 0}
  <p class="muted">No blocked contacts.</p>
{:else}
  <ul class="list">
    {#each list as c (c.id)}
      <li>
        <span class="avatar" style:background={c.color}>
          {(c.displayName[0] ?? '?').toUpperCase()}
        </span>
        <span class="meta">
          <span class="name">{c.displayName}</span>
          <span class="addr">{c.address}</span>
        </span>
        <button class="unblock" onclick={() => unblock(c.id)}>Unblock</button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-xl);
  }
  .muted {
    color: var(--color-fg-tertiary);
  }
  .list {
    max-width: 520px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-border);
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: white;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-weight: 600;
  }
  .addr {
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .unblock {
    padding: 6px 12px;
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
  }
</style>
