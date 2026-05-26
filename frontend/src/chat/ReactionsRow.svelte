<script lang="ts">
  import { toggleReaction, type ReactionEntry } from '../lib/state/chat.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    /** Per-emoji tallies to render. */
    reactions: ReactionEntry[];
    /** Message the chips act on — target of the toggle / reactor sheet. */
    messageId: number;
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
    /** Read-only summary (gallery aggregate): every chip is inert. */
    readonly?: boolean;
    /** True when the chips visually hang off a bubble's rounded corner —
     *  the standard case. False for jumbomoji (no bubble chrome, no corner
     *  to attach to), where the negative top margin would otherwise pull
     *  the chips up into the timestamp band. */
    attached?: boolean;
  };

  let {
    reactions,
    messageId,
    showCount = true,
    isGroup,
    onShowReactors,
    readonly = false,
    attached = true,
  }: Props = $props();

  function onChipClick(r: ReactionEntry) {
    // Own chips always toggle (tap-the-same-emoji-to-unreact, matching
    // mobile). Foreign chips open the reactor sheet in groups; in 1:1
    // they're inert — the chip is purely informational.
    if (readonly) return;
    if (r.isFromSelf) void toggleReaction(messageId, r.emoji);
    else if (isGroup) onShowReactors(messageId);
  }
</script>

{#if reactions.length > 0}
  <div
    class="row"
    class:detached={!attached}
    role="group"
    aria-label={t('Reactions')}
    data-testid="reactions-row"
    data-msg-id={messageId}
  >
    {#each reactions as r (r.emoji)}
      {@const actionable = !readonly && (r.isFromSelf || isGroup)}
      <button
        class="chip"
        class:mine={r.isFromSelf}
        class:static={!actionable}
        onclick={() => onChipClick(r)}
        disabled={!actionable}
        aria-pressed={r.isFromSelf}
        aria-label="{r.emoji} reaction, {r.count}"
        data-testid="reactions-row__chip"
        data-emoji={r.emoji}
        data-mine={r.isFromSelf ? 'true' : 'false'}
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
  /* Jumbomoji has no bubble chrome — there's no rounded corner to overlap,
   * so the standard -6px pull would land the chip on top of the meta /
   * timestamp row that sits directly below the emoji. Sit cleanly below. */
  .row.detached {
    margin-top: 4px;
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
    font-size: var(--text-xs);
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
