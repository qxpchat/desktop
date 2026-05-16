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
  import BackButton from '../lib/BackButton.svelte';
  import SearchField from '../lib/SearchField.svelte';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onSelectChat: (id: number) => void;
  };

  let { onSelectChat }: Props = $props();

  let search = $state('');
  let errorMsg = $state<string | null>(null);

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
      errorMsg = err instanceof Error ? err.message : String(err);
    }
  }

  function newContact() {
    setMainRoute({ kind: 'qrScan', purpose: 'newContact' });
  }
  function newGroup() {
    setPaneMode({ kind: 'chooseMembers', flow: 'group', selected: [] });
  }
  function newChannel() {
    // No member picker for channels: broadcast recipients can only join via
    // QR/securejoin (core rejects add_contact_to_chat on OutBroadcast unless
    // from_handshake). Go straight to naming; invite via QR afterwards.
    setPaneMode({ kind: 'setGroupMetadata', flow: 'channel', selected: [] });
  }
</script>

<aside class="pane" aria-label={t('New conversation')} data-testid="compose-pane">
  <header class="header">
    <BackButton label={t('Back')} onclick={backToInbox} data-testid="compose-pane__back" />
    <h2>{t('New conversation')}</h2>
  </header>

  <div class="search-row">
    <SearchField
      placeholder={t('Search contacts…')}
      aria-label={t('Search contacts')}
      bind:value={search}
      data-testid="compose-pane__search"
    />
  </div>

  <ul class="actions">
    <li>
      <button class="action" onclick={newContact} data-testid="compose-pane__new-contact">
        <span class="icon" aria-hidden="true"><Icon name="user-plus" size={18} /></span>
        <span class="label">{t('New Contact')}</span>
        <span class="hint">{t('Scan a QR code')}</span>
      </button>
    </li>
    <li>
      <button class="action" onclick={newGroup} data-testid="compose-pane__new-group">
        <span class="icon" aria-hidden="true"><Icon name="users" size={18} /></span>
        <span class="label">{t('New Group')}</span>
      </button>
    </li>
    <li>
      <button class="action" onclick={newChannel} data-testid="compose-pane__new-channel">
        <span class="icon" aria-hidden="true"><Icon name="megaphone" size={18} /></span>
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

<ConfirmDialog
  open={errorMsg != null}
  mode="alert"
  title={t('Could not start chat')}
  message={errorMsg ?? ''}
  onClose={() => (errorMsg = null)}
/>

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
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .search-row {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
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
    /* Leave breathing room below the last contact — without this the
       final row gets clipped at the viewport bottom when the list
       overflows. A full row-height (~48px) of padding mirrors what iOS
       Settings does on long lists. */
    padding-bottom: 48px;
  }
  .empty {
    padding: var(--space-5) var(--space-4);
    color: var(--color-fg-tertiary);
    text-align: center;
    font-size: var(--text-sm);
  }
</style>
