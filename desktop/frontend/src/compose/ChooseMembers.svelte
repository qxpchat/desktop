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

  type Props = {
    mode: { kind: 'chooseMembers'; flow: 'group' | 'channel'; selected: number[] };
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

  let headerLabel = $derived(mode.flow === 'group' ? 'New Group' : 'New Channel');
  let actionLabel = $derived(`Next${selected.length > 0 ? ` · ${selected.length}` : ''}`);

  let selectedContacts = $derived(
    contacts.contacts.filter((c) => selected.includes(c.id)),
  );
</script>

<div class="pane">
  <header class="header">
    <button class="back" onclick={backToInbox} aria-label="Cancel">‹</button>
    <h2>{headerLabel}</h2>
    <div class="spacer"></div>
    <button class="next" disabled={selected.length === 0} onclick={next}>{actionLabel}</button>
  </header>

  <div class="search-row">
    <input
      class="search"
      type="search"
      placeholder="Search contacts…"
      aria-label="Search contacts"
      bind:value={search}
    />
  </div>

  {#if selectedContacts.length > 0}
    <div class="pills" role="list" aria-label="Selected contacts">
      {#each selectedContacts as c (c.id)}
        <button class="pill" onclick={() => toggle(c.id)} aria-label="Remove {c.displayName}">
          <span class="dot" style:background={c.color}></span>
          {c.displayName || c.address}
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
      <li class="empty">{search.length > 0 ? 'No contacts match.' : 'No contacts yet.'}</li>
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
  .back {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    color: var(--color-accent);
    font-size: 22px;
    line-height: 1;
  }
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .next {
    height: 32px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
  }
  .next:disabled {
    opacity: 0.4;
    cursor: default;
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
    border-color: var(--color-accent);
    background: var(--color-bg-pane);
    outline: none;
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
    padding: 4px 8px;
    border-radius: 14px;
    background: var(--color-bg-hover);
    color: var(--color-fg);
    font-size: var(--text-sm);
  }
  .pill:hover {
    background: var(--color-border);
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
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
