<script lang="ts">
  import {
    contacts,
    setContactsScope,
    setContactsQuery,
  } from '../lib/state/contacts.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import ContactRow from '../compose/ContactRow.svelte';
  import Modal from '../lib/Modal.svelte';
  import IconButton from '../lib/IconButton.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    open: boolean;
    onPick: (contactId: number) => void;
    onClose: () => void;
  };

  let { open, onPick, onClose }: Props = $props();

  let search = $state('');

  $effect(() => {
    if (open) setContactsScope(accounts.selectedId, 0);
  });
  $effect(() => {
    setContactsQuery(search);
  });

  function pick(id: number) {
    onPick(id);
    onClose();
  }
</script>

<Modal {open} {onClose} size="md" ariaLabel={t('Pick a contact')} data-testid="contact-picker">
  <div class="content">
    <header>
      <h2>{t('Send Contact')}</h2>
      <IconButton variant="subtle" size={28} icon="x" label={t('Close')} onclick={onClose} />
    </header>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="search"
      type="search"
      placeholder={t('Search contacts…')}
      bind:value={search}
      autofocus
    />
    <ul class="list">
      {#each contacts.contacts as c (c.id)}
        <li>
          <ContactRow contact={c} onSelect={pick} />
        </li>
      {/each}
      {#if !contacts.loading && contacts.contacts.length === 0}
        <li class="empty">{t('No contacts.')}</li>
      {/if}
    </ul>
  </div>
</Modal>

<style>
  .content {
    display: flex;
    flex-direction: column;
    max-height: 70vh;
  }
  header {
    display: flex;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .search {
    margin: var(--space-3) var(--space-4) 0;
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
  .list {
    overflow-y: auto;
    flex: 1;
    margin-top: var(--space-2);
  }
  .empty {
    padding: var(--space-5);
    text-align: center;
    color: var(--color-fg-tertiary);
  }
</style>
