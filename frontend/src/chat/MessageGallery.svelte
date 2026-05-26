<script lang="ts">
  import {
    CONTACT_ID_SELF,
    chat,
    messageReactions,
    messageStateGlyph,
    type Message,
    type ReactionEntry,
  } from '../lib/state/chat.svelte';
  import { fileUrl } from '../lib/files';
  import { openLightbox } from '../lib/state/lightbox.svelte';
  import { formatShortTime } from '../lib/format/timestamp';
  import ReactionsRow from './ReactionsRow.svelte';
  import Icon from '../lib/Icon.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    /** The 2+ consecutive media messages collapsed into this gallery. */
    messages: Message[];
    /** Show sender name (true in groups & broadcasts). */
    showSender: boolean;
    /** Show per-emoji counts on the aggregated reaction chips. */
    showReactionCount: boolean;
    /** Open the context menu for a tapped tile, anchored at the cursor. */
    onContextMenu: (msg: Message, x: number, y: number) => void;
    /** Unroll the gallery into individual message bubbles. */
    onExpand: () => void;
  };

  let { messages, showSender, showReactionCount, onContextMenu, onExpand }: Props = $props();

  let first = $derived(messages[0]);
  let outgoing = $derived(first.fromId === CONTACT_ID_SELF);
  // Flash the whole gallery when a jump targets any collapsed member.
  let flashing = $derived(messages.some((m) => m.id === chat.highlightId));
  let senderName = $derived(first.overrideSenderName || first.sender?.displayName || '');
  let senderColor = $derived(first.sender?.color ?? 'var(--color-accent)');

  // Caption = the first member's text. The split rule guarantees only the
  // first member of a gallery can carry one (a later captioned message
  // would have opened its own gallery).
  let caption = $derived((first.text ?? '').trim());
  // Timestamp + delivery state stand in for the whole run, taken from its
  // last member. messageStateGlyph already returns null for incoming states.
  let last = $derived(messages[messages.length - 1]);
  let lastTime = $derived(formatShortTime(last.timestamp));
  let lastGlyph = $derived(outgoing ? messageStateGlyph(last.state) : null);

  // Tiles beyond the 4th collapse into a "+N" overlay on the 4th tile.
  const MAX_TILES = 4;
  let visible = $derived(messages.slice(0, MAX_TILES));
  let overflow = $derived(Math.max(0, messages.length - MAX_TILES));
  // With 3 tiles the last one spans both columns, so the grid isn't left
  // with a ragged half-empty cell.
  let wideLast = $derived(visible.length === 3);

  // Aggregate every member's reactions into one per-emoji summary.
  let summary = $derived.by<ReactionEntry[]>(() => {
    const agg = new Map<string, { count: number; isFromSelf: boolean }>();
    for (const m of messages) {
      for (const r of messageReactions(m)) {
        const e = agg.get(r.emoji) ?? { count: 0, isFromSelf: false };
        e.count += r.count;
        e.isFromSelf = e.isFromSelf || r.isFromSelf;
        agg.set(r.emoji, e);
      }
    }
    return [...agg].map(([emoji, v]) => ({ emoji, ...v }));
  });

  function tileUrl(m: Message): string {
    return fileUrl(m.file ?? undefined) ?? '';
  }
  function openTile(m: Message) {
    void openLightbox({
      url: tileUrl(m),
      kind: m.viewType === 'Video' ? 'video' : 'image',
      caption: m.text || undefined,
      msgId: m.id,
      timestamp: m.timestamp,
      fileName: m.fileName ?? undefined,
    });
  }
  function tileContext(e: MouseEvent, m: Message) {
    e.preventDefault();
    onContextMenu(m, e.clientX, e.clientY);
  }
</script>

<div class="row" class:outgoing class:incoming={!outgoing}>
  <div class="bubble-wrap">
    <div
      class="bubble"
      class:flash={flashing}
      data-testid="message-gallery"
      data-direction={outgoing ? 'outgoing' : 'incoming'}
      data-count={messages.length}
    >
      {#if !outgoing && showSender && senderName}
        <div class="sender" style:color={senderColor}>{senderName}</div>
      {/if}

      <div class="grid" class:wide-last={wideLast}>
        {#each visible as m, i (m.id)}
          <button
            class="tile"
            onclick={() => openTile(m)}
            oncontextmenu={(e) => tileContext(e, m)}
            title={t('Open image')}
            data-testid="message-gallery__tile"
            data-msg-id={m.id}
          >
            {#if m.viewType === 'Video'}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video src={tileUrl(m)} preload="metadata" muted></video>
              <span class="play" aria-hidden="true"><Icon name="play" size={20} /></span>
            {:else}
              <img src={tileUrl(m)} alt={m.fileName ?? t('image')} />
            {/if}
            {#if overflow > 0 && i === visible.length - 1}
              <span class="more">+{overflow}</span>
            {/if}
          </button>
        {/each}
      </div>

      {#if caption}
        <div class="caption" data-testid="message-gallery__caption">{caption}</div>
      {/if}

      <div class="footer">
        <button
          type="button"
          class="unroll"
          onclick={onExpand}
          data-testid="message-gallery__unroll"
        >
          <Icon name="chevron-down" size={14} />
          <span>{t('Show all')}</span>
        </button>
        <span class="meta">
          <span class="time">{lastTime}</span>
          {#if lastGlyph}
            <span
              class="state {lastGlyph.kind}"
              aria-label={lastGlyph.kind}
              data-testid="message-gallery__state"
              data-state={lastGlyph.kind}
            >
              <Icon name={lastGlyph.icon} size={12} stroke={2} />
            </span>
          {/if}
        </span>
      </div>
    </div>
    <ReactionsRow
      reactions={summary}
      messageId={first.id}
      showCount={showReactionCount}
      isGroup={false}
      onShowReactors={() => {}}
      readonly
    />
  </div>
</div>

<style>
  /* Bubble shell mirrors MessageBubble's `.row` / `.bubble` so the gallery
   * sits flush in the timeline with the same alignment and fill. */
  .row {
    display: flex;
    flex-direction: column;
    padding: 2px var(--space-4);
    max-width: 100%;
  }
  .row.outgoing {
    align-items: flex-end;
  }
  .row.incoming {
    align-items: flex-start;
  }
  .bubble-wrap {
    max-width: min(560px, 80%);
  }
  .bubble {
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 1px 0 var(--color-shadow);
  }
  .row.outgoing .bubble {
    background: var(--color-accent);
    color: var(--color-accent-fg);
    border-bottom-right-radius: 2px;
  }
  .row.incoming .bubble {
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border-bottom-left-radius: 2px;
  }
  .row.incoming .bubble.flash {
    --flash-color: var(--color-accent);
  }
  .row.outgoing .bubble.flash {
    --flash-color: #fff;
  }
  .bubble.flash {
    animation: flash 1.2s ease;
  }
  @keyframes flash {
    0% {
      box-shadow: 0 0 0 4px var(--flash-color);
    }
    100% {
      box-shadow: 0 1px 0 var(--color-shadow);
    }
  }
  .sender {
    font-weight: 600;
    font-size: var(--text-xs);
    padding: 8px 12px 6px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
  }
  .grid.wide-last .tile:last-child {
    grid-column: span 2;
  }
  .tile {
    position: relative;
    display: block;
    padding: 0;
    border: 0;
    margin: 0;
    aspect-ratio: 1;
    overflow: hidden;
    background: var(--color-bg-hover);
    cursor: pointer;
  }
  .tile img,
  .tile video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .play {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(0, 0, 0, 0.25);
  }
  /* "+N" overlay on the last visible tile when the run has more media than
   * the grid shows. The tile still opens the lightbox, which carries the
   * whole chat gallery for ← / → navigation. */
  .more {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .caption {
    padding: 6px 12px 0;
    white-space: pre-wrap;
    user-select: text;
    -webkit-user-select: text;
    line-height: 1.4;
    font-size: var(--text-lg);
  }
  .footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px 8px;
  }
  .unroll {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    background: transparent;
    border: 0;
    color: inherit;
    font: inherit;
    font-size: var(--text-sm);
    opacity: 0.8;
    cursor: pointer;
  }
  .unroll:hover {
    opacity: 1;
  }
  .meta {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .time {
    font-size: 10px;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }
  .state {
    display: inline-flex;
    align-items: center;
  }
  .state.failed {
    color: var(--color-danger);
  }
  .state.pending :global(svg) {
    animation: spin 1.2s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
