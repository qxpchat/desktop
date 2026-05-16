<script lang="ts">
  // Modal chat picker — used for "Forward to…" in Phase 10's message-action
  // menu. Reuses the chatlist store but renders a simplified row through
  // the shared `Avatar` so chat profile pictures actually appear (the
  // previous inline avatar only painted the initial letter).
  import { chatlist } from '../lib/state/chatlist.svelte';
  import Avatar from '../lib/Avatar.svelte';
  import Modal from '../lib/Modal.svelte';
  import IconButton from '../lib/IconButton.svelte';
  import SearchField from '../lib/SearchField.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    open: boolean;
    onPick: (chatId: number) => void;
    onClose: () => void;
  };

  let { open, onPick, onClose }: Props = $props();
  let search = $state('');

  let visible = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const all = chatlist.ids
      .map((id) => chatlist.items.get(id))
      .filter((x): x is NonNullable<typeof x> => x != null);
    if (!q) return all;
    return all.filter((c) => c.name.toLowerCase().includes(q));
  });
</script>

<Modal {open} {onClose} size="md" ariaLabel={t('Forward to chat')} data-testid="chat-picker">
  <div class="content">
    <header>
      <h2>{t('Forward to…')}</h2>
      <IconButton
        variant="subtle"
        size={28}
        icon="x"
        label={t('Close')}
        onclick={onClose}
        data-testid="chat-picker__close"
      />
    </header>
    <SearchField
      class="picker-search"
      placeholder={t('Search chats…')}
      bind:value={search}
      data-testid="chat-picker__search"
    />
    <ul class="list">
      {#each visible as c (c.id)}
        <li>
          <button class="row" onclick={() => onPick(c.id)} data-testid="chat-picker__row" data-chat-id={c.id} data-name={c.name || ''}>
            <Avatar name={c.name || '?'} color={c.color} imagePath={c.avatarPath} size={36} />
            <span class="name">{c.name || t('(no name)')}</span>
          </button>
        </li>
      {/each}
      {#if visible.length === 0}
        <li class="empty">{t('No chats.')}</li>
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
  .content :global(.picker-search) {
    margin: var(--space-3) var(--space-4) 0;
  }
  .list {
    overflow-y: auto;
    flex: 1;
    margin-top: var(--space-2);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-4);
    text-align: left;
    background: transparent;
    color: var(--color-fg);
  }
  .row:hover {
    background: var(--color-bg-hover);
  }
  .name {
    flex: 1;
    font-weight: 500;
  }
  .empty {
    padding: var(--space-5);
    text-align: center;
    color: var(--color-fg-tertiary);
  }
</style>
