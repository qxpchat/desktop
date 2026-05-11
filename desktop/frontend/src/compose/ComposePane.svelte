<script lang="ts">
  import { onMount } from 'svelte';
  import {
    contacts,
    setContactsScope,
    setContactsQuery,
    GCL_ADD_SELF,
  } from '../lib/state/contacts.svelte';
  import { backToInbox, setPaneMode } from '../lib/state/paneMode.svelte';
  import { setMainRoute } from '../lib/state/mainRoute.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import { rpc } from '../lib/rpc';
  import ContactRow from './ContactRow.svelte';
  import Icon from '../lib/Icon.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onSelectChat: (id: number) => void;
  };

  let { onSelectChat }: Props = $props();

  let search = $state('');

  // Initialise contact scope on mount; refresh when account switches.
  $effect(() => {
    setContactsScope(accounts.selectedId, GCL_ADD_SELF);
  });
  $effect(() => {
    setContactsQuery(search);
  });

  onMount(() => {
    setContactsScope(accounts.selectedId, GCL_ADD_SELF);
  });

  async function selectContact(contactId: number) {
    if (accounts.selectedId == null) return;
    try {
      const chatId = await rpc.call<number>('create_chat_by_contact_id', [
        accounts.selectedId,
        contactId,
      ]);
      onSelectChat(chatId);
      backToInbox();
    } catch (err) {
      alert(`${t('Could not start chat')}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function newContact() {
    setMainRoute({ kind: 'qrScan', purpose: 'newContact' });
  }
  function newGroup() {
    setPaneMode({ kind: 'chooseMembers', flow: 'group', selected: [] });
  }
  function newChannel() {
    setPaneMode({ kind: 'chooseMembers', flow: 'channel', selected: [] });
  }
</script>

<aside class="pane" aria-label={t('New conversation')}>
  <header class="header">
    <button class="back" onclick={backToInbox} title={t('Back')} aria-label={t('Back to inbox')}>‹</button>
    <h2>{t('New conversation')}</h2>
  </header>

  <div class="search-row">
    <input
      class="search"
      type="search"
      placeholder={t('Search contacts…')}
      aria-label={t('Search contacts')}
      bind:value={search}
    />
  </div>

  <ul class="actions">
    <li>
      <button class="action" onclick={newContact}>
        <span class="icon" aria-hidden="true">＋</span>
        <span class="label">{t('New Contact')}</span>
        <span class="hint">{t('Scan a QR code')}</span>
      </button>
    </li>
    <li>
      <button class="action" onclick={newGroup}>
        <span class="icon" aria-hidden="true">⌬</span>
        <span class="label">{t('New Group')}</span>
      </button>
    </li>
    <li>
      <button class="action" onclick={newChannel}>
        <span class="icon" aria-hidden="true">📣</span>
        <span class="label">{t('New Channel')}</span>
      </button>
    </li>
  </ul>

  <ul class="list">
    {#each contacts.contacts as contact (contact.id)}
      <li>
        <ContactRow {contact} onSelect={selectContact} />
      </li>
    {/each}
    {#if !contacts.loading && contacts.contacts.length === 0}
      <li class="empty">{search.length > 0 ? t('No contacts match.') : t('No contacts yet.')}</li>
    {/if}
  </ul>
</aside>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-pane);
    border-right: 1px solid var(--color-border);
    overflow: hidden;
    flex: 0 0 auto;
    width: 100%;
    height: 100%;
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    min-height: 56px;
    flex: 0 0 auto;
  }
  .back {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    color: var(--color-accent);
    font-size: 22px;
    line-height: 1;
  }
  .back:hover {
    background: var(--color-bg-hover);
  }
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .search-row {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .search {
    width: 100%;
    height: 32px;
    border-radius: var(--radius-md);
    background: var(--color-bg-hover);
    padding: 0 var(--space-3);
    border: 1px solid transparent;
    font-size: var(--text-md);
  }
  .search:focus {
    outline: none;
  }
  .actions {
    display: block;
    border-bottom: 1px solid var(--color-border);
    flex: 0 0 auto;
  }
  .actions li {
    display: block;
    width: 100%;
  }
  .action {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    text-align: left;
  }
  .action:hover {
    background: var(--color-bg-hover);
  }
  .icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--color-accent-soft);
    color: var(--color-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex: 0 0 auto;
  }
  .label {
    font-weight: 600;
    flex: 1;
  }
  .hint {
    color: var(--color-fg-tertiary);
    font-size: var(--text-sm);
  }
  .list {
    overflow-y: auto;
    flex: 1;
  }
  .empty {
    padding: var(--space-5) var(--space-4);
    color: var(--color-fg-tertiary);
    text-align: center;
    font-size: var(--text-sm);
  }
</style>
