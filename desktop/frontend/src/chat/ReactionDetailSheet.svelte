<script lang="ts">
  // Modal listing every contact who reacted to a message and the emoji(s)
  // they used. Mirrors the iOS ReactionDetailSheet — tapping a chip opens
  // this sheet instead of toggling the user's own reaction.

  import { onMount, onDestroy } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { chat, CONTACT_ID_SELF } from '../lib/state/chat.svelte';
  import type { Contact } from '../lib/state/contacts.svelte';
  import Avatar from '../lib/Avatar.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    open: boolean;
    messageId: number | null;
    onClose: () => void;
  };

  let { open, messageId, onClose }: Props = $props();

  let contactsById = $state<Map<number, Contact>>(new Map());
  let loadGen = 0;

  let message = $derived(
    messageId != null ? (chat.messages.get(messageId) ?? null) : null,
  );

  type ReactorRow = { contactId: number; emojis: string[] };
  let rows: ReactorRow[] = $derived.by(() => {
    const r = message?.reactions as
      | { reactionsByContact?: Record<number, string[]> }
      | undefined;
    const byContact = r?.reactionsByContact;
    if (!byContact) return [];
    return Object.entries(byContact)
      .map(([k, emojis]) => ({ contactId: Number(k), emojis }))
      .filter((row) => row.emojis.length > 0)
      .sort((a, b) => {
        // Put "you" first, then by contact id (matches the ordering that
        // backs the reaction chips themselves).
        if (a.contactId === CONTACT_ID_SELF) return -1;
        if (b.contactId === CONTACT_ID_SELF) return 1;
        return a.contactId - b.contactId;
      });
  });

  $effect(() => {
    if (!open || messageId == null) return;
    const ids = rows.map((r) => r.contactId);
    if (ids.length === 0) return;
    const accountId = chat.active?.accountId;
    if (accountId == null) return;
    const gen = ++loadGen;
    void (async () => {
      try {
        const map = await rpc.call<Record<number, Contact>>('get_contacts_by_ids', [
          accountId,
          ids,
        ]);
        if (gen !== loadGen) return;
        const next = new Map<number, Contact>();
        for (const [k, v] of Object.entries(map)) next.set(Number(k), v);
        contactsById = next;
      } catch {
        // Names just fall back to "—" in the row.
      }
    })();
  });

  function nameFor(contactId: number): string {
    if (contactId === CONTACT_ID_SELF) return t('You');
    return contactsById.get(contactId)?.displayName || '—';
  }

  function colorFor(contactId: number): string {
    return contactsById.get(contactId)?.color || 'var(--color-accent)';
  }

  function avatarFor(contactId: number): string | null {
    return contactsById.get(contactId)?.profileImage ?? null;
  }

  function onWindowKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }
  onMount(() => window.addEventListener('keydown', onWindowKey));
  onDestroy(() => window.removeEventListener('keydown', onWindowKey));
</script>

{#if open}
  <button class="backdrop" onclick={onClose} aria-label={t('Close')}></button>
  <div class="card" role="dialog" aria-modal="true" aria-label={t('Reactions')}>
    <h2>{t('Reactions')}</h2>
    {#if rows.length === 0}
      <p class="empty">{t('No reactions yet.')}</p>
    {:else}
      <ul class="list">
        {#each rows as r (r.contactId)}
          <li class="row">
            <Avatar
              name={nameFor(r.contactId)}
              color={colorFor(r.contactId)}
              imagePath={avatarFor(r.contactId)}
              size={32}
            />
            <span class="name">{nameFor(r.contactId)}</span>
            <span class="emojis">{r.emojis.join(' ')}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: var(--z-modal);
    border: 0;
  }
  .card {
    position: fixed;
    z-index: calc(var(--z-modal) + 1);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(420px, calc(100vw - 24px));
    max-height: min(560px, calc(100vh - 48px));
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    padding: 16px 0 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 16px 48px var(--color-shadow);
    overflow: hidden;
  }
  h2 {
    margin: 0;
    padding: 0 20px;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .empty {
    margin: 0;
    padding: 12px 20px 16px;
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 20px;
  }
  .name {
    flex: 1;
    min-width: 0;
    font-size: var(--text-md);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .emojis {
    font-size: 20px;
    font-variant-emoji: emoji;
  }
</style>
