<script lang="ts">
  // In-chat media browser — Gallery (image+gif+video), Audio (audio+voice),
  // Files. Backed by `get_chat_media`.

  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { canRecallMessage, loadMessages, type Message } from '../lib/state/chat.svelte';
  import { jumpToMessage } from '../lib/state/jump';
  import { backToChat } from '../lib/state/mainRoute.svelte';
  import { fileUrl, formatBytes } from '../lib/files';
  import { onEvent } from '../lib/events';
  import Icon from '../lib/Icon.svelte';
  import DeleteMessageDialog from '../chat/DeleteMessageDialog.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = { chatId: number };
  let { chatId }: Props = $props();

  type Tab = 'gallery' | 'audio' | 'files';
  let tab = $state<Tab>('gallery');

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
      // loadMessages unwraps the wire union at the state-module boundary —
      // we get clean `Message[]` without `kind === 'message'` checks here.
      const out = await loadMessages(accounts.selectedId, ids);
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

  function jump(msgId: number) {
    void jumpToMessage(msgId, { chatId, returnToChat: true });
  }

  let deleteTarget = $state<{ id: number; canDeleteForAll: boolean } | null>(null);

  function deleteItem(msgId: number) {
    const m = items.find((it) => it.id === msgId);
    deleteTarget = { id: msgId, canDeleteForAll: m != null && canRecallMessage(m) };
  }

  async function performDelete(forAll: boolean) {
    if (deleteTarget == null || accounts.selectedId == null) return;
    const method = forAll ? 'delete_messages_for_all' : 'delete_messages';
    await rpc.call(method, [accounts.selectedId, [deleteTarget.id]]);
    await load();
  }
</script>

<section class="media" data-testid="media-browser" data-tab={tab}>
  <header class="topbar">
    <button class="back" onclick={backToChat} aria-label={t('Back')} data-testid="media-browser__back">‹ {t('Back')}</button>
    <h1>{t('Media')}</h1>
  </header>

  <div class="tabs" role="tablist">
    {#each [{ id: 'gallery', label: t('Gallery') }, { id: 'audio', label: t('Audio') }, { id: 'files', label: t('Files') }] as tabDef}
      <button
        role="tab"
        class:active={tab === tabDef.id}
        aria-selected={tab === tabDef.id}
        onclick={() => (tab = tabDef.id as Tab)}
        data-testid="media-browser__tab"
        data-tab={tabDef.id}
      >
        {tabDef.label}
      </button>
    {/each}
  </div>

  <div class="body">
    {#if loading}
      <p class="muted" data-testid="media-browser__loading">{t('Loading…')}</p>
    {:else if items.length === 0}
      <p class="muted" data-testid="media-browser__empty">{t('Nothing yet.')}</p>
    {:else if tab === 'gallery'}
      <div class="grid" data-testid="media-browser__grid">
        {#each items as m (m.id)}
          <button class="thumb" onclick={() => jump(m.id)} oncontextmenu={(e) => { e.preventDefault(); void deleteItem(m.id); }} data-testid="media-browser__tile" data-msg-id={m.id} data-view-type={m.viewType}>
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
      <ul class="list" data-testid="media-browser__list">
        {#each items as m (m.id)}
          <li data-testid="media-browser__row" data-msg-id={m.id} data-view-type={m.viewType}>
            <span class="icon" aria-hidden="true">
              <Icon name={m.viewType === 'Voice' ? 'mic' : 'music'} size={18} stroke={2} />
            </span>
            <span class="meta">
              <span class="name">{m.fileName ?? (m.viewType === 'Voice' ? t('Voice message') : t('Audio'))}</span>
              <span class="sub">{new Date(m.timestamp * 1000).toLocaleString()} · {formatBytes(m.fileBytes)}</span>
            </span>
            <button class="link" onclick={() => jump(m.id)} data-testid="media-browser__row-show">{t('Show')}</button>
            <button class="link danger" onclick={() => void deleteItem(m.id)} data-testid="media-browser__row-delete">{t('Delete')}</button>
          </li>
        {/each}
      </ul>
    {:else}
      <ul class="list" data-testid="media-browser__list">
        {#each items as m (m.id)}
          <li data-testid="media-browser__row" data-msg-id={m.id} data-view-type={m.viewType}>
            <span class="icon" aria-hidden="true">
              <Icon name="paperclip" size={18} stroke={2} />
            </span>
            <span class="meta">
              <span class="name">{m.fileName ?? t('file')}</span>
              <span class="sub">{new Date(m.timestamp * 1000).toLocaleString()} · {formatBytes(m.fileBytes)}</span>
            </span>
            <a class="link" href={fileUrl(m.file ?? undefined)} download={m.fileName ?? undefined} data-testid="media-browser__row-download">{t('Download')}</a>
            <button class="link" onclick={() => jump(m.id)} data-testid="media-browser__row-show">{t('Show')}</button>
            <button class="link danger" onclick={() => void deleteItem(m.id)} data-testid="media-browser__row-delete">{t('Delete')}</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<DeleteMessageDialog
  open={deleteTarget != null}
  canDeleteForAll={deleteTarget?.canDeleteForAll ?? false}
  onDeleteForMe={() => void performDelete(false)}
  onDeleteForAll={() => void performDelete(true)}
  onClose={() => (deleteTarget = null)}
/>

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
