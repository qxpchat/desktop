<script lang="ts">
  import type { Contact } from '../lib/state/contacts.svelte';

  type Props = {
    contact: Contact;
    onSelect: (id: number) => void;
    /** When true, render a leading checkbox for multi-select (group/channel members). */
    selectable?: boolean;
    selected?: boolean;
  };

  let { contact, onSelect, selectable = false, selected = false }: Props = $props();

  let displayName = $derived(
    contact.displayName || contact.name || contact.address || '(no name)',
  );
  let initial = $derived(displayName[0]?.toUpperCase() ?? '?');
</script>

<button class="row" class:selected onclick={() => onSelect(contact.id)} aria-pressed={selected}>
  {#if selectable}
    <span class="check" aria-hidden="true">{selected ? '☑' : '☐'}</span>
  {/if}
  <span class="avatar" style:background={contact.color} aria-hidden="true">{initial}</span>
  <span class="meta">
    <span class="name">
      {displayName}
      {#if contact.isVerified}
        <span class="verified" title="Verified" aria-label="verified">✓</span>
      {/if}
    </span>
    {#if contact.address && contact.address !== displayName}
      <span class="addr">{contact.address}</span>
    {/if}
  </span>
</button>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    text-align: left;
    transition: background 0.1s ease;
  }
  .row:hover {
    background: var(--color-bg-hover);
  }
  .row.selected {
    background: var(--color-bg-selected);
  }
  .check {
    width: 22px;
    flex: 0 0 auto;
    color: var(--color-accent);
    font-size: 18px;
    line-height: 1;
  }
  .avatar {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: white;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .verified {
    color: #2ecc71;
    font-size: 14px;
  }
  .addr {
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
