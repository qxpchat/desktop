<script lang="ts">
  // Canonical "pick a contact" row, used by ComposePane, ChooseMembers,
  // ContactPickerModal and anywhere else we let the user pick a person.
  // Renders the shared `Avatar` (so `profileImage` shows up) — the
  // previous inline avatar span only painted the initial on a coloured
  // background, which is why profile pictures were missing across all
  // picker UIs.
  import type { Contact } from '../lib/state/contacts.svelte';
  import Avatar from '../lib/Avatar.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    contact: Contact;
    onSelect: (id: number) => void;
    /** When true, render a leading checkbox for multi-select (group/channel members). */
    selectable?: boolean;
    selected?: boolean;
  };

  let { contact, onSelect, selectable = false, selected = false }: Props = $props();

  let displayName = $derived(
    contact.displayName || contact.name || contact.address || t('(no name)'),
  );
</script>

<button class="row" class:selected onclick={() => onSelect(contact.id)} aria-pressed={selected} data-testid="contact-row" data-contact-id={contact.id} data-name={displayName}>
  {#if selectable}
    <span class="check" class:on={selected} aria-hidden="true">
      {#if selected}✓{/if}
    </span>
  {/if}
  <Avatar
    name={displayName}
    color={contact.color}
    imagePath={contact.profileImage}
    size={40}
    seenRecently={contact.wasSeenRecently}
  />
  <span class="meta">
    <span class="name">
      <span class="name-text">{displayName}</span>
      {#if contact.isVerified}
        <span class="verified" title={t('Verified')} aria-label={t('verified')}>✓</span>
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
    justify-content: flex-start;
    gap: var(--space-3);
    width: 100%;
    padding: 10px var(--space-3);
    text-align: left;
    transition: background 0.1s ease;
  }
  .row:hover {
    background: var(--color-bg-hover);
  }
  .row.selected {
    background: var(--color-bg-selected);
  }
  /* iOS-style circle checkmark instead of an emoji ☐/☑ — those rendered
     inconsistent sizes across system fonts. */
  .check {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1.5px solid var(--color-border-strong);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: transparent;
    font-size: 13px;
    font-weight: 700;
    transition: background 0.1s ease, border-color 0.1s ease, color 0.1s ease;
  }
  .check.on {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
    min-width: 0;
  }
  .name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .verified {
    color: #2ecc71;
    font-size: 14px;
    flex: 0 0 auto;
  }
  .addr {
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
