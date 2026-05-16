<script lang="ts">
  // In-chat find bar — opens on Cmd/Ctrl-F when a chat is active, scopes
  // `search_messages` to that chat, and steps prev/next through hits with
  // jump-and-flash behaviour.

  import { rpc } from '../lib/rpc';
  import { flashMessage } from '../lib/state/chat.svelte';
  import IconButton from '../lib/IconButton.svelte';
  import SearchField from '../lib/SearchField.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    accountId: number;
    chatId: number;
    open: boolean;
    onClose: () => void;
  };

  let { accountId, chatId, open, onClose }: Props = $props();

  let query = $state('');
  let hits = $state<number[]>([]);
  let index = $state(0);
  let busy = $state(false);
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let gen = 0;

  // The bar is `{#if open}`-gated, so it mounts fresh each open — `autofocus`
  // on the field fires every time. Reset hit state when it closes.
  $effect(() => {
    if (!open) {
      query = '';
      hits = [];
      index = 0;
    }
  });

  // Reset hits when account/chat changes.
  $effect(() => {
    void accountId;
    void chatId;
    hits = [];
    index = 0;
  });

  $effect(() => {
    const q = query.trim();
    if (debounce != null) clearTimeout(debounce);
    if (!q) {
      hits = [];
      index = 0;
      return;
    }
    debounce = setTimeout(() => {
      debounce = null;
      void run(q);
    }, 200);
  });

  async function run(q: string) {
    const my = ++gen;
    busy = true;
    try {
      const ids = await rpc.call<number[]>('search_messages', [accountId, q, chatId]);
      if (my !== gen) return;
      hits = ids;
      index = 0;
      if (ids.length > 0) jumpTo(ids[0]);
    } catch (err) {
      if (my === gen) {
        console.error('in-chat search failed:', err);
        hits = [];
      }
    } finally {
      if (my === gen) busy = false;
    }
  }

  function jumpTo(msgId: number) {
    flashMessage(msgId);
    queueMicrotask(() => {
      const el = document.getElementById(`msg-${msgId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function next() {
    if (hits.length === 0) return;
    index = (index + 1) % hits.length;
    jumpTo(hits[index]);
  }
  function prev() {
    if (hits.length === 0) return;
    index = (index - 1 + hits.length) % hits.length;
    jumpTo(hits[index]);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prev();
      else next();
    }
  }
</script>

{#if open}
  <div class="bar" role="search" data-testid="in-chat-search">
    <SearchField
      class="find-field"
      placeholder={t('Find in chat…')}
      bind:value={query}
      onkeydown={onKeyDown}
      autofocus
      aria-label={t('Find in chat')}
      data-testid="in-chat-search__input"
    />
    <span class="count" aria-live="polite" data-testid="in-chat-search__count">
      {#if busy}
        …
      {:else if hits.length > 0}
        {index + 1} / {hits.length}
      {:else if query}
        0 / 0
      {/if}
    </span>
    <IconButton
      variant="subtle"
      size={28}
      icon="chevron-up"
      label={t('Previous match')}
      title={t('Previous (Shift+Enter)')}
      disabled={hits.length === 0}
      onclick={prev}
      data-testid="in-chat-search__prev"
    />
    <IconButton
      variant="subtle"
      size={28}
      icon="chevron-down"
      label={t('Next match')}
      title={t('Next (Enter)')}
      disabled={hits.length === 0}
      onclick={next}
      data-testid="in-chat-search__next"
    />
    <IconButton
      variant="subtle"
      size={28}
      icon="x"
      label={t('Close find')}
      title={t('Close (Esc)')}
      onclick={onClose}
      data-testid="in-chat-search__close"
    />
  </div>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-bg-elevated);
    border-bottom: 1px solid var(--color-border);
  }
  .bar :global(.find-field) {
    flex: 1;
  }
  .count {
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
    font-variant-numeric: tabular-nums;
    min-width: 4em;
    text-align: right;
  }
</style>
