<script lang="ts">
  // The GIF picker: a Modal with a search field and a 3-column grid. Empty
  // search → recents (per-account, sorted by usage); non-empty → live giphy
  // results (debounced 300ms). Search results are picked with a single
  // left click. Recents tiles route through a Popover menu (per spec — left
  // click on a recent opens [Insert, Delete] rather than acting directly).
  //
  // The picker only *picks* — caching the chosen GIF to the local file
  // store, threading it into the composer's pending state, and recording
  // it in recents all happen on the caller side after `onPick` fires.
  import Modal from '../lib/Modal.svelte';
  import SearchField from '../lib/SearchField.svelte';
  import MenuItem from '../lib/MenuItem.svelte';
  import Popover from '../lib/Popover.svelte';
  import { searchGifs, type GifResult } from '../lib/gifs/giphy';
  import { gifRecents, removeGif, type GifRecent } from '../lib/gifs/recents.svelte';
  import { forgetCachedGif } from '../lib/gifs/cache';
  import { deleteDaemonFile, fileUrl } from '../lib/files';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    open: boolean;
    /** Currently-active account; recents are scoped per-account. */
    accountId: number | null;
    /** Called when the user commits a pick from either grid. */
    onPick: (g: { url: string; term: string }) => void;
    onClose: () => void;
  };

  let { open, accountId, onPick, onClose }: Props = $props();

  let search = $state('');
  let results = $state<GifResult[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let menuFor = $state<{
    url: string;
    term: string;
    localPath: string;
    x: number;
    y: number;
  } | null>(null);

  let recents = $derived.by((): GifRecent[] => {
    if (accountId == null) return [];
    const arr = gifRecents.byAccount[accountId] ?? [];
    return [...arr].sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  });

  // Debounced search. `searchSeq` guards against an old request resolving
  // after a newer one has already fired — the late one would otherwise
  // overwrite fresher results with stale ones.
  let searchSeq = 0;
  $effect(() => {
    const q = search.trim();
    const me = ++searchSeq;
    if (!q) {
      results = [];
      loading = false;
      error = null;
      return;
    }
    loading = true;
    error = null;
    const handle = setTimeout(async () => {
      try {
        const r = await searchGifs(q);
        if (me !== searchSeq) return;
        results = r;
      } catch (e) {
        if (me !== searchSeq) return;
        error = e instanceof Error ? e.message : String(e);
      } finally {
        if (me === searchSeq) loading = false;
      }
    }, 300);
    return () => clearTimeout(handle);
  });

  // Reset the picker every time it closes so the next open starts fresh.
  $effect(() => {
    if (!open) {
      search = '';
      results = [];
      menuFor = null;
      error = null;
    }
  });

  function pickResult(g: GifResult) {
    onPick({ url: g.url, term: search.trim() });
  }

  function pickRecent(r: GifRecent) {
    onPick({ url: r.url, term: r.term });
  }

  function openRecentMenu(e: MouseEvent, r: GifRecent) {
    e.preventDefault();
    e.stopPropagation();
    menuFor = { url: r.url, term: r.term, localPath: r.localPath, x: e.clientX, y: e.clientY };
  }

  async function deleteFromMenu() {
    if (!menuFor || accountId == null) return;
    const m = menuFor;
    menuFor = null;
    removeGif(accountId, m.url);
    forgetCachedGif(m.url);
    if (m.localPath) {
      try {
        await deleteDaemonFile(m.localPath);
      } catch {
        // File may already be gone (e.g. accounts dir wiped) — recents has
        // already been pruned, so the user-visible state is correct.
      }
    }
  }
</script>

<Modal {open} {onClose} size="lg" ariaLabel={t('Insert GIF')}>
  <div class="head">
    <SearchField placeholder={t('Search GIFs…')} bind:value={search} autofocus />
  </div>

  <!-- Popover sits *inside* the Modal so it shares the modal's stacking
       context (Modal overlay z-index = --z-modal = 100; Popover uses
       --z-overlay = 10, which would otherwise hide it behind the modal
       backdrop). -->
  {#if menuFor}
    <Popover
      x={menuFor.x}
      y={menuFor.y}
      onClose={() => (menuFor = null)}
      ariaLabel={t('GIF actions')}
    >
      <div class="menu">
        <MenuItem icon="trash" danger label={t('Delete')} onclick={deleteFromMenu} />
      </div>
    </Popover>
  {/if}

  <div class="body" data-testid="gif-picker__body">
    {#if loading}
      <div class="hint">{t('Searching…')}</div>
    {:else if error}
      <div class="hint error">{error}</div>
    {:else if search.trim().length === 0}
      {#if recents.length === 0}
        <div class="hint">{t('Send or receive a GIF to see it here.')}</div>
      {:else}
        <div class="grid" data-testid="gif-picker__recents">
          {#each recents as r (r.url)}
            <button
              type="button"
              class="tile"
              onclick={() => pickRecent(r)}
              oncontextmenu={(e) => openRecentMenu(e, r)}
              title={r.term || t('GIF')}
            >
              <img src={fileUrl(r.localPath)} alt={r.term} loading="lazy" />
            </button>
          {/each}
        </div>
      {/if}
    {:else if results.length === 0}
      <div class="hint">{t('No GIFs match.')}</div>
    {:else}
      <div class="grid" data-testid="gif-picker__results">
        {#each results as g (g.id)}
          <button type="button" class="tile" onclick={() => pickResult(g)} title={g.title}>
            <img src={g.url} alt={g.title} loading="lazy" />
          </button>
        {/each}
      </div>
    {/if}
  </div>
</Modal>

<style>
  .head {
    padding: var(--space-3) var(--space-3) 0;
  }
  .body {
    padding: var(--space-3);
    overflow-y: auto;
    /* The modal card already caps its own max-height; sizing the body to
     * fill the remaining space keeps the grid scrollable without the whole
     * card expanding past the viewport on long result sets. */
    flex: 1;
    min-height: 240px;
  }
  .hint {
    text-align: center;
    color: var(--color-fg-tertiary);
    padding: var(--space-4);
  }
  .hint.error {
    color: var(--color-danger);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .tile {
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--color-bg-hover);
    cursor: pointer;
    aspect-ratio: 1 / 1;
  }
  .tile:hover {
    outline: 2px solid var(--color-accent);
  }
  .tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .menu {
    padding: 4px;
    min-width: 160px;
  }
</style>
