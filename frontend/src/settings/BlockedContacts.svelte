<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import Avatar from '../lib/Avatar.svelte';
  import Button from '../lib/Button.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Contact = {
    id: number;
    displayName: string;
    address: string;
    color: string;
    profileImage: string | null;
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
    await rpc.call('unblock_contact', [accounts.selectedId, id]);
    await load();
  }
</script>

<h2>{t('Blocked')}</h2>

{#if loading}
  <p class="muted">{t('Loading…')}</p>
{:else if list.length === 0}
  <p class="muted" data-testid="settings-blocked__empty">{t('No blocked contacts.')}</p>
{:else}
  <ul class="list" data-testid="settings-blocked__list">
    {#each list as c (c.id)}
      <li class="row" data-testid="settings-blocked__row" data-contact-id={c.id} data-address={c.address}>
        <Avatar name={c.displayName} color={c.color} imagePath={c.profileImage} size={36} />
        <span class="meta">
          <span class="name">{c.displayName}</span>
          <span class="addr">{c.address}</span>
        </span>
        <Button variant="secondary" size="sm" onclick={() => unblock(c.id)} data-testid="settings-blocked__unblock">
          {t('Unblock')}
        </Button>
      </li>
    {/each}
  </ul>
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
  .list {
    max-width: 560px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 10px 0;
  }
  .row + .row {
    border-top: 1px solid var(--color-border);
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
</style>
