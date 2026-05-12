<script lang="ts">
  import { toggleReaction, type Message } from '../lib/state/chat.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    message: Message;
    /** When false the per-emoji count is hidden — useful in 1:1 chats where
     *  the count is always 1 and adds noise. */
    showCount?: boolean;
    /** True for groups & broadcasts. Determines whether tapping a foreign
     *  chip opens the reactor sheet (1:1 chats hide it — the other reactor
     *  is the only person it could be). */
    isGroup: boolean;
    /** Open the reactor detail sheet for this message — only fires in
     *  groups, for chips the user didn't react with themselves. */
    onShowReactors: (messageId: number) => void;
  };

  let { message, showCount = true, isGroup, onShowReactors }: Props = $props();

  type ReactionEntry = { emoji: string; count: number; isFromSelf: boolean };
  let reactions = $derived.by(() => {
    const r = message.reactions as
      | { reactions?: ReactionEntry[] }
      | undefined;
    return r?.reactions ?? [];
  });

  function onChipClick(r: ReactionEntry) {
    // Own chips always toggle (tap-the-same-emoji-to-unreact, matching
    // mobile). Foreign chips open the reactor sheet in groups; in 1:1
    // they're inert — the chip is purely informational.
    if (r.isFromSelf) void toggleReaction(message.id, r.emoji);
    else if (isGroup) onShowReactors(message.id);
  }
</script>

{#if reactions.length > 0}
  <div class="row" role="group" aria-label={t('Reactions')}>
    {#each reactions as r (r.emoji)}
      {@const actionable = r.isFromSelf || isGroup}
      <button
        class="chip"
        class:mine={r.isFromSelf}
        class:static={!actionable}
        onclick={() => onChipClick(r)}
        disabled={!actionable}
        aria-pressed={r.isFromSelf}
        aria-label="{r.emoji} reaction, {r.count}"
      >
        <span class="emoji">{r.emoji}</span>
        {#if showCount}
          <span class="count">{r.count}</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  /* Reactions render as a sibling of the bubble. The negative top margin
   * pulls the chip up just enough to overlap the bubble's bottom rounded
   * corner — visually "attached" without entering the bubble's content /
   * meta band. Identical placement for every bubble type (text, media,
   * media-only, jumbomoji). */
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: -6px 8px 0;
    /* `.bubble.media` is `position: relative`, which kicks it into the
     * positioned-descendants paint phase that lands on top of static
     * siblings — without our own stacking context the chip's overlap
     * with the picture would be painted under it. */
    position: relative;
    z-index: 1;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    font-size: 11px;
    box-shadow: 0 1px 2px var(--color-shadow);
  }
  .chip:not(:disabled) {
    cursor: pointer;
  }
  .chip:not(:disabled):hover {
    background: var(--color-bg-hover);
  }
  .chip.mine {
    background: var(--color-accent-soft);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .chip.mine:not(:disabled):hover {
    background: var(--color-accent-soft);
    filter: brightness(0.96);
  }
  /* Foreign chips in 1:1 — no action available, but still render the chip
   * so the user can see the reaction. Keep full opacity (the chip is
   * informational, not "broken"). */
  .chip.static {
    cursor: default;
  }
  .emoji {
    font-size: 14px;
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
</style>
