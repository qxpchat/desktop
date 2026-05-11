<script lang="ts">
  import { toggleReaction } from '../lib/state/chat.svelte';
  import type { Message } from '../lib/state/chat.svelte';

  type Props = {
    message: Message;
    /** When false the per-emoji count is hidden — useful in 1:1 chats where
     *  the count is always 1 and adds noise. */
    showCount?: boolean;
    /** Bubble is media without a caption — chips can't overlap into the
     *  bubble's bottom corner without covering the image, so sit below. */
    mediaOnly?: boolean;
  };

  let { message, showCount = true, mediaOnly = false }: Props = $props();

  type ReactionEntry = { emoji: string; count: number; isFromSelf: boolean };
  let reactions = $derived.by(() => {
    const r = message.reactions as
      | { reactions?: ReactionEntry[] }
      | undefined;
    return r?.reactions ?? [];
  });
</script>

{#if reactions.length > 0}
  <div class="row" class:below={mediaOnly} role="group" aria-label="Reactions">
    {#each reactions as r (r.emoji)}
      <button
        class="chip"
        class:mine={r.isFromSelf}
        onclick={() => void toggleReaction(message.id, r.emoji)}
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
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    /* Tiny overlap into the bubble's bottom border-radius so the chip
     * looks attached, not "hanging below". The previous full -12px
     * overlap collided with the in-bubble timestamp on short messages;
     * -2px sits inside the rounded corner zone only, well below the
     * meta row's vertical position. */
    margin-top: -8px;
    margin-right: 6px;
    margin-left: 6px;
  }
  .row.below {
    /* Media-only bubbles have no rounded-corner safe zone (the image
     * extends to the bubble edge), so chips can't overlap without
     * covering the image — sit cleanly below instead. */
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
    font-size: 11px;
    box-shadow: 0 1px 2px var(--color-shadow);
  }
  .chip:hover {
    background: var(--color-bg-hover);
  }
  .chip.mine {
    background: var(--color-accent-soft);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .emoji {
    font-size: 14px;
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
</style>
