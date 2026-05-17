<script lang="ts">
  import { CATEGORY_LABELS, EMOJI, type Category } from '../lib/emoji/data';
  import { emojiRecents, recordEmojiUse } from '../lib/emoji/recents.svelte';
  import SearchField from '../lib/SearchField.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    open: boolean;
    onPick: (emoji: string) => void;
    onClose: () => void;
  };

  let { open, onPick, onClose }: Props = $props();

  let search = $state('');
  let activeCat = $state<Category>('smileys');

  function pickEmoji(c: string) {
    recordEmojiUse(c);
    onPick(c);
    onClose();
  }

  let categories: Category[] = ['smileys', 'people', 'nature', 'food', 'activity', 'travel', 'objects', 'symbols'];

  // Recents is a single 8-wide row — the grid has 8 columns, so cap the
  // strip at 8 to keep it exactly one row.
  let recents = $derived(emojiRecents.list.slice(0, 8));

  let visible = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (q) return EMOJI.filter((e) => e.k.includes(q));
    return EMOJI.filter((e) => e.cat === activeCat);
  });

  // Escape dismisses — listener lifecycle-bound to the open window.
  $effect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

{#if open}
  <button class="backdrop" onclick={onClose} aria-label={t('Close picker')}></button>
  <div class="picker" role="dialog" aria-label={t('Emoji picker')}>
    <SearchField placeholder={t('Search emoji…')} bind:value={search} />

    {#if !search && recents.length > 0}
      <div class="section-label">{t('Recents')}</div>
      <div class="grid recents-grid">
        {#each recents as e (e)}
          <button class="emoji" onclick={() => pickEmoji(e)} aria-label={e}>{e}</button>
        {/each}
      </div>
    {/if}

    {#if !search}
      <nav class="cats" aria-label={t('Categories')}>
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
        <div class="empty">{t('No emoji match.')}</div>
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
  .cats {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--color-border);
  }
  .cats button {
    flex: 1;
    height: 32px;
    border-radius: 0;
    border-bottom: 2px solid transparent;
    /* Overlap the nav's divider so the active underline sits on it. */
    margin-bottom: -1px;
    background: transparent;
    font-size: 16px;
    opacity: 0.55;
    transition: opacity 0.1s ease, border-color 0.1s ease;
  }
  .cats button:hover {
    opacity: 1;
    background: var(--color-bg-hover);
  }
  .cats button.active {
    opacity: 1;
    border-bottom-color: var(--color-accent);
  }
  .section-label {
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
    margin-top: 2px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 2px;
    overflow-y: auto;
    flex: 1;
  }
  /* Recents is a fixed MRU strip, not a scroll region — size it to its
     rows so it never sprouts its own scrollbar (and the aspect-ratio /
     overflow:auto reflow oscillation that comes with one). */
  .recents-grid {
    flex: 0 0 auto;
    overflow: visible;
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
