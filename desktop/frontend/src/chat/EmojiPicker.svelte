<script lang="ts">
  import { CATEGORY_LABELS, EMOJI, type Category } from '../lib/emoji/data';
  import { onMount } from 'svelte';

  type Props = {
    open: boolean;
    onPick: (emoji: string) => void;
    onClose: () => void;
  };

  let { open, onPick, onClose }: Props = $props();

  let search = $state('');
  let activeCat = $state<Category>('smileys');

  const RECENTS_KEY = 'qxp.web.emojiRecents';
  let recents = $state<string[]>([]);

  onMount(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) recents = JSON.parse(raw) as string[];
    } catch {
      /* ignore corrupted */
    }
  });

  function persistRecents() {
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, 32)));
    } catch {
      /* ignore */
    }
  }

  function pickEmoji(c: string) {
    recents = [c, ...recents.filter((x) => x !== c)].slice(0, 32);
    persistRecents();
    onPick(c);
    onClose();
  }

  let categories: Category[] = ['smileys', 'people', 'nature', 'food', 'activity', 'travel', 'objects', 'symbols'];

  let visible = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (q) return EMOJI.filter((e) => e.k.includes(q));
    return EMOJI.filter((e) => e.cat === activeCat);
  });
</script>

{#if open}
  <button class="backdrop" onclick={onClose} aria-label="Close picker"></button>
  <div class="picker" role="dialog" aria-label="Emoji picker">
    <input
      type="search"
      class="search"
      placeholder="Search emoji…"
      bind:value={search}
    />

    {#if !search && recents.length > 0}
      <div class="section-label">Recents</div>
      <div class="grid">
        {#each recents as e}
          <button class="emoji" onclick={() => pickEmoji(e)} aria-label={e}>{e}</button>
        {/each}
      </div>
    {/if}

    {#if !search}
      <nav class="cats" aria-label="Categories">
        {#each categories as c}
          <button
            class:active={activeCat === c}
            onclick={() => (activeCat = c)}
            title={CATEGORY_LABELS[c]}
          >
            {labelIcon(c)}
          </button>
        {/each}
      </nav>
    {/if}

    <div class="grid">
      {#each visible as e (e.c)}
        <button class="emoji" onclick={() => pickEmoji(e.c)} title={e.k} aria-label={e.k}>
          {e.c}
        </button>
      {/each}
      {#if visible.length === 0}
        <div class="empty">No emoji match.</div>
      {/if}
    </div>
  </div>
{/if}

<script lang="ts" module>
  function labelIcon(c: string): string {
    return (
      {
        smileys: '😀',
        people: '👋',
        nature: '🌿',
        food: '🍕',
        activity: '⚽',
        travel: '🚗',
        objects: '💡',
        symbols: '✨',
      } as Record<string, string>
    )[c] ?? c;
  }
</script>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 19;
    border: 0;
  }
  .picker {
    position: absolute;
    z-index: 20;
    width: 320px;
    max-width: calc(100vw - 16px);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px var(--color-shadow);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 360px;
  }
  .search {
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
  .cats {
    display: flex;
    gap: 2px;
  }
  .cats button {
    flex: 1;
    height: 28px;
    border-radius: var(--radius-sm);
    background: transparent;
    font-size: 16px;
  }
  .cats button:hover {
    background: var(--color-bg-hover);
  }
  .cats button.active {
    background: var(--color-bg-hover);
    box-shadow: inset 0 -2px 0 var(--color-accent);
  }
  .section-label {
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
    margin-top: 2px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
    overflow-y: auto;
    flex: 1;
  }
  .emoji {
    aspect-ratio: 1;
    font-size: 20px;
    border-radius: var(--radius-sm);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .emoji:hover {
    background: var(--color-bg-hover);
  }
  .empty {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--color-fg-tertiary);
    padding: var(--space-4);
  }
</style>
