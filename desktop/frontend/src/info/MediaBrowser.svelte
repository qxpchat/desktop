<script lang="ts">
  // In-chat media browser — Gallery (image+gif+video), Audio (audio+voice),
  // Files. Backed by `get_chat_media`.

  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { backToChat } from '../lib/state/mainRoute.svelte';
  import { selectChat } from '../lib/state/selection.svelte';
  import { flashMessage } from '../lib/state/chat.svelte';
  import { fileUrl, formatBytes } from '../lib/files';
  import { onEvent } from '../lib/events';

  type Props = { chatId: number };
  let { chatId }: Props = $props();

  type Tab = 'gallery' | 'audio' | 'files';
  let tab = $state<Tab>('gallery');

  type Message = {
    id: number;
    chatId: number;
    viewType: string;
    file: string | null;
    fileName: string | null;
    fileBytes: number;
    text: string;
    timestamp: number;
    duration: number;
  };

  let items = $state<Message[]>([]);
  let loading = $state(true);

  const VIEWTYPES_FOR_TAB: Record<Tab, string[]> = {
    gallery: ['Image', 'Gif', 'Video'],
    audio: ['Audio', 'Voice'],
    files: ['File'],
  };

  $effect(() => {
    void chatId;
    void tab;
    void load();
  });

  onMount(load);

  async function load() {
    if (accounts.selectedId == null) return;
    loading = true;
    try {
      const types = VIEWTYPES_FOR_TAB[tab];
      const ids = await rpc.call<number[]>('get_chat_media', [
        accounts.selectedId,
        chatId,
        types[0],
        types[1] ?? null,
        types[2] ?? null,
      ]);
      if (ids.length === 0) {
        items = [];
        return;
      }
      // get_messages returns map; sort newest-first.
      const map = await rpc.call<
        Record<number, { kind: 'message' } & Message | { kind: 'loadingError' }>
      >('get_messages', [accounts.selectedId, ids]);
      const out: Message[] = [];
      for (const id of ids) {
        const r = map[id];
        if (r && r.kind === 'message') out.push(r as Message);
      }
      out.sort((a, b) => b.timestamp - a.timestamp);
      items = out;
    } catch (err) {
      console.warn('media load failed', err);
      items = [];
    } finally {
      loading = false;
    }
  }

  onEvent('MsgsChanged', (ev) => {
    if (ev.contextId === accounts.selectedId) void load();
  });
  onEvent('IncomingMsg', (ev) => {
    if (ev.contextId === accounts.selectedId) void load();
  });

  function jumpToMessage(msgId: number) {
    selectChat(chatId);
    backToChat();
    queueMicrotask(() => {
      flashMessage(msgId);
      const el = document.getElementById(`msg-${msgId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  async function deleteItem(msgId: number) {
    if (!confirm('Delete this item?') || accounts.selectedId == null) return;
    await rpc.call('delete_messages', [accounts.selectedId, [msgId]]);
    await load();
  }
</script>

<section class="media">
  <header class="topbar">
    <button class="back" onclick={backToChat} aria-label="Back">‹ Back</button>
    <h1>Media</h1>
  </header>

  <div class="tabs" role="tablist">
    {#each ['gallery', 'audio', 'files'] as t}
      <button
        role="tab"
        class:active={tab === t}
        aria-selected={tab === t}
        onclick={() => (tab = t as Tab)}
      >
        {t.charAt(0).toUpperCase() + t.slice(1)}
      </button>
    {/each}
  </div>

  <div class="body">
    {#if loading}
      <p class="muted">Loading…</p>
    {:else if items.length === 0}
      <p class="muted">Nothing yet.</p>
    {:else if tab === 'gallery'}
      <div class="grid">
        {#each items as m (m.id)}
          <button class="thumb" onclick={() => jumpToMessage(m.id)} oncontextmenu={(e) => { e.preventDefault(); void deleteItem(m.id); }}>
            {#if m.viewType === 'Video'}
              <span class="play" aria-hidden="true">▶</span>
            {/if}
            {#if m.file}
              <img src={fileUrl(m.file)} alt={m.fileName ?? ''} loading="lazy" />
            {/if}
          </button>
        {/each}
      </div>
    {:else if tab === 'audio'}
      <ul class="list">
        {#each items as m (m.id)}
          <li>
            <span class="icon">{m.viewType === 'Voice' ? '🎤' : '🎵'}</span>
            <span class="meta">
              <span class="name">{m.fileName ?? (m.viewType === 'Voice' ? 'Voice message' : 'Audio')}</span>
              <span class="sub">{new Date(m.timestamp * 1000).toLocaleString()} · {formatBytes(m.fileBytes)}</span>
            </span>
            <button class="link" onclick={() => jumpToMessage(m.id)}>Show</button>
            <button class="link danger" onclick={() => void deleteItem(m.id)}>Delete</button>
          </li>
        {/each}
      </ul>
    {:else}
      <ul class="list">
        {#each items as m (m.id)}
          <li>
            <span class="icon">📎</span>
            <span class="meta">
              <span class="name">{m.fileName ?? 'file'}</span>
              <span class="sub">{new Date(m.timestamp * 1000).toLocaleString()} · {formatBytes(m.fileBytes)}</span>
            </span>
            <a class="link" href={fileUrl(m.file ?? undefined)} download={m.fileName ?? undefined}>Download</a>
            <button class="link" onclick={() => jumpToMessage(m.id)}>Show</button>
            <button class="link danger" onclick={() => void deleteItem(m.id)}>Delete</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .media {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
    min-height: 56px;
    flex: 0 0 auto;
  }
  .back {
    color: var(--color-accent);
    font-size: var(--text-md);
  }
  h1 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
  }
  .tabs button {
    flex: 1;
    padding: 10px;
    background: transparent;
    color: var(--color-fg-secondary);
    font-weight: 500;
    border-bottom: 2px solid transparent;
  }
  .tabs button.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3);
  }
  .muted {
    color: var(--color-fg-tertiary);
    text-align: center;
    padding: var(--space-5);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 4px;
  }
  .thumb {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--color-bg-hover);
    padding: 0;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .thumb .play {
    position: absolute;
    bottom: 4px;
    left: 6px;
    color: white;
    font-size: 14px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }
  .list {
    display: flex;
    flex-direction: column;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    border-bottom: 1px solid var(--color-border);
  }
  .icon {
    font-size: 22px;
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
  }
  .sub {
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
  }
  .link {
    background: transparent;
    color: var(--color-accent);
    text-decoration: none;
    padding: 4px 8px;
  }
  .link.danger {
    color: var(--color-danger);
  }
</style>
