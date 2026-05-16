<script lang="ts">
  import { onMount } from 'svelte';
  import {
    contacts,
    setContactsScope,
    setContactsQuery,
  } from '../lib/state/contacts.svelte';
  import { backToInbox, setPaneMode } from '../lib/state/paneMode.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import ContactRow from './ContactRow.svelte';
  import Avatar from '../lib/Avatar.svelte';
  import Button from '../lib/Button.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import SearchField from '../lib/SearchField.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    mode: { kind: 'chooseMembers'; flow: 'group'; selected: number[] };
  };

  let { mode }: Props = $props();

  // Pre-fill the pick set from the previous step. Reading mode.selected only
  // once is intentional — the parent recreates this component when it
  // navigates between chooseMembers and setGroupMetadata so the snapshot is
  // always fresh.
  // svelte-ignore state_referenced_locally
  let selected = $state<number[]>([...mode.selected]);
  let search = $state('');

  // Don't include self in member picker (DC adds self automatically).
  $effect(() => {
    setContactsScope(accounts.selectedId, 0);
  });
  $effect(() => {
    setContactsQuery(search);
  });

  onMount(() => {
    setContactsScope(accounts.selectedId, 0);
  });

  function toggle(id: number) {
    if (selected.includes(id)) {
      selected = selected.filter((x) => x !== id);
    } else {
      selected = [...selected, id];
    }
  }

  function next() {
    setPaneMode({ kind: 'setGroupMetadata', flow: mode.flow, selected });
  }

  let actionLabel = $derived(`${t('Next')}${selected.length > 0 ? ` · ${selected.length}` : ''}`);

  let selectedContacts = $derived(
    contacts.contacts.filter((c) => selected.includes(c.id)),
  );
</script>

<div class="pane" data-testid="choose-members" data-flow={mode.flow}>
  <header class="header">
    <BackButton label={t('Cancel')} onclick={backToInbox} data-testid="choose-members__cancel" />
    <h2>{t('New Group')}</h2>
    <div class="spacer"></div>
    <Button
      variant="primary"
      size="sm"
      disabled={selected.length === 0}
      onclick={next}
      data-testid="choose-members__next"
    >{actionLabel}</Button>
  </header>

  <div class="search-row">
    <SearchField
      placeholder={t('Search contacts…')}
      aria-label={t('Search contacts')}
      bind:value={search}
      data-testid="choose-members__search"
    />
  </div>

  {#if selectedContacts.length > 0}
    <div class="pills" role="list" aria-label={t('Selected contacts')}>
      {#each selectedContacts as c (c.id)}
        <button class="pill" onclick={() => toggle(c.id)} aria-label={t('Remove {name}', { name: c.displayName })}>
          <Avatar name={c.displayName || '?'} color={c.color} imagePath={c.profileImage} size={20} />
          <span class="pill-name">{c.displayName || c.address}</span>
          <span class="x" aria-hidden="true">×</span>
        </button>
      {/each}
    </div>
  {/if}

  <ul class="list">
    {#each contacts.contacts as contact (contact.id)}
      <li>
        <ContactRow
          {contact}
          selectable
          selected={selected.includes(contact.id)}
          onSelect={toggle}
        />
      </li>
    {/each}
    {#if !contacts.loading && contacts.contacts.length === 0}
      <li class="empty">{search.length > 0 ? t('No contacts match.') : t('No contacts yet.')}</li>
    {/if}
  </ul>
</div>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    min-height: 56px;
  }
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .search-row {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 3px 3px;
    border-radius: 14px;
    background: var(--color-bg-hover);
    color: var(--color-fg);
    font-size: var(--text-sm);
  }
  .pill:hover {
    background: var(--color-border);
  }
  .pill-name {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .x {
    margin-left: 2px;
    color: var(--color-fg-tertiary);
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
