<script lang="ts">
  import { onMount } from 'svelte';
  import {
    contacts,
    setContactsScope,
    setContactsQuery,
  } from '../lib/state/contacts.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import ContactRow from '../compose/ContactRow.svelte';

  type Props = {
    open: boolean;
    onPick: (contactId: number) => void;
    onClose: () => void;
  };

  let { open, onPick, onClose }: Props = $props();

  let search = $state('');

  $effect(() => {
    if (open) {
      setContactsScope(accounts.selectedId, 0);
    }
  });
  $effect(() => {
    setContactsQuery(search);
  });

  onMount(() => {
    if (open) setContactsScope(accounts.selectedId, 0);
  });

  function pick(id: number) {
    onPick(id);
    onClose();
  }
</script>

{#if open}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Pick a contact"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') onClose();
    }}
  >
    <div class="card">
      <header>
        <h2>Send Contact</h2>
        <button class="close" onclick={onClose} aria-label="Close">✕</button>
      </header>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="search"
        type="search"
        placeholder="Search contacts…"
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
          <li class="empty">No contacts.</li>
        {/if}
      </ul>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    backdrop-filter: blur(2px);
  }
  .card {
    width: min(420px, calc(100vw - 24px));
    max-height: 70vh;
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .close {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-fg-secondary);
    font-size: 14px;
  }
  .close:hover {
    background: var(--color-bg-hover);
  }
  .search {
    margin: 12px 16px 0;
    height: 32px;
    border-radius: var(--radius-md);
    background: var(--color-bg-hover);
    padding: 0 var(--space-3);
    border: 1px solid transparent;
    font-size: var(--text-md);
  }
  .search:focus {
    border-color: var(--color-accent);
    background: var(--color-bg);
    outline: none;
  }
  .list {
    overflow-y: auto;
    flex: 1;
    margin-top: 8px;
  }
  .empty {
    padding: 20px;
    text-align: center;
    color: var(--color-fg-tertiary);
  }
</style>
