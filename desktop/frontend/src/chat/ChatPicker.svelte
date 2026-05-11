<script lang="ts">
  // Modal chat picker — used for "Forward to…" in Phase 10's message-action
  // menu. Reuses the chatlist store but renders a simplified row through
  // the shared `Avatar` so chat profile pictures actually appear (the
  // previous inline avatar only painted the initial letter).
  import { chatlist } from '../lib/state/chatlist.svelte';
  import Avatar from '../lib/Avatar.svelte';
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

{#if open}
  <button class="backdrop" onclick={onClose} aria-label={t('Close picker')}></button>
  <div class="card" role="dialog" aria-label={t('Forward to chat')}>
    <header>
      <h2>{t('Forward to…')}</h2>
      <button class="close" onclick={onClose} aria-label={t('Close')}>✕</button>
    </header>
    <input
      type="search"
      class="search"
      placeholder={t('Search chats…')}
      bind:value={search}
    />
    <ul class="list">
      {#each visible as c (c.id)}
        <li>
          <button class="row" onclick={() => onPick(c.id)}>
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
  }
  .close:hover {
    background: var(--color-bg-hover);
  }
  .search {
    margin: 12px 16px 0;
    height: 32px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg-hover);
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
  .row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    width: 100%;
    padding: 10px 16px;
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
    padding: 20px;
    text-align: center;
    color: var(--color-fg-tertiary);
  }
</style>
