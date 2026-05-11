<script lang="ts">
  import { CONTACT_ID_SELF, MSG_STATE, chat, type Message } from '../lib/state/chat.svelte';
  import { chatlist } from '../lib/state/chatlist.svelte';
  import ImageCell from './cells/ImageCell.svelte';
  import VideoCell from './cells/VideoCell.svelte';
  import FileCell from './cells/FileCell.svelte';
  import VcardCell from './cells/VcardCell.svelte';
  import LocationCell from './cells/LocationCell.svelte';
  import AudioCell from './cells/AudioCell.svelte';
  import VoiceCell from './cells/VoiceCell.svelte';
  import ReactionsRow from './ReactionsRow.svelte';
  import Icon, { type IconName } from '../lib/Icon.svelte';
  import { linkify } from '../lib/format/linkify';

  type Props = {
    message: Message;
    /** Show sender name+stripe (true in groups & broadcasts). */
    showSender: boolean;
    /** Show per-emoji counter on reaction chips (true in groups; false in 1:1). */
    showReactionCount: boolean;
    /** Open the context menu anchored at the click coords. */
    onContextMenu: (msg: Message, x: number, y: number) => void;
    /** Jump to and highlight a quoted message. */
    onJumpToMessage: (msgId: number) => void;
  };

  let { message, showSender, showReactionCount, onContextMenu, onJumpToMessage }: Props =
    $props();

  let outgoing = $derived(message.fromId === CONTACT_ID_SELF);
  let highlighted = $derived(chat.highlightId === message.id);

  type Glyph = { icon: IconName; kind: 'pending' | 'delivered' | 'read' | 'failed' };
  let stateGlyph = $derived.by((): Glyph | null => {
    if (!outgoing) return null;
    switch (message.state) {
      case MSG_STATE.OutPreparing:
      case MSG_STATE.OutPending:
        return { icon: 'loader', kind: 'pending' };
      case MSG_STATE.OutDelivered:
        return { icon: 'check', kind: 'delivered' };
      case MSG_STATE.OutMdnRcvd:
        return { icon: 'check-check', kind: 'read' };
      case MSG_STATE.OutFailed:
        return { icon: 'alert-circle', kind: 'failed' };
      default:
        return null;
    }
  });

  let timeLabel = $derived(formatTime(message.timestamp));
  function formatTime(unixSec: number): string {
    if (unixSec <= 0) return '';
    const d = new Date(unixSec * 1000);
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d);
  }

  let senderName = $derived(message.overrideSenderName || message.sender?.displayName || '');
  let senderColor = $derived(message.sender?.color ?? 'var(--color-accent)');

  // Quote rendering — `message.quote` may be { kind: 'JustText', text }
  // or { kind: 'WithMessage', text, messageId, ... }. Wire tags are PascalCase
  // because rust enum `MessageQuote` uses `#[serde(tag = "kind")]` without
  // enum-level `rename_all`.
  type QuoteWithMsg = {
    kind: 'WithMessage';
    text: string;
    messageId: number;
    authorDisplayName: string;
    authorDisplayColor: string;
    image?: string;
  };
  type QuoteJust = { kind: 'JustText'; text: string };
  let quote = $derived(message.quote as QuoteWithMsg | QuoteJust | null);

  function onJumpQuote() {
    if (quote && quote.kind === 'WithMessage') onJumpToMessage(quote.messageId);
  }

  function handleContext(e: MouseEvent) {
    e.preventDefault();
    onContextMenu(message, e.clientX, e.clientY);
  }


  // Bubble width / shape for media-only.
  let mediaBubble = $derived(
    message.viewType === 'Image' || message.viewType === 'Gif' || message.viewType === 'Video',
  );
  /** True when the bubble is media (image/video) without a caption — the meta
   *  row floats over the bottom-right corner of the image instead of sitting
   *  in its own padded section below. */
  let mediaOnly = $derived(mediaBubble && !message.text);
  /** Cells that render their own inline caption (audio/voice/vcard/file/location).
   *  Image and video render flush in the bubble and let MessageBubble own the
   *  caption text below. */
  let cellOwnsText = $derived(
    message.viewType === 'Voice' ||
      message.viewType === 'Audio' ||
      message.viewType === 'Vcard' ||
      message.viewType === 'File' ||
      message.hasLocation,
  );

  // Group-or-broadcast — only show sender name on incoming.
  let _ = chatlist; // referenced for future name lookups in groups
  void _;
</script>

<div class="row" class:outgoing class:incoming={!outgoing}>
  <div class="bubble-wrap">
    <div
      class="bubble"
      class:edited={message.isEdited}
      class:failed={message.state === MSG_STATE.OutFailed}
      class:media={mediaBubble}
      class:media-only={mediaOnly}
      class:flash={highlighted}
      oncontextmenu={handleContext}
      role="article"
    >
      {#if !outgoing && showSender && senderName}
        <div class="sender" style:color={senderColor}>{senderName}</div>
      {/if}

      {#if quote}
        <button class="quote" onclick={onJumpQuote} type="button">
          <span class="quote-bar" style:background={quote.kind === 'WithMessage' ? quote.authorDisplayColor : 'var(--color-accent)'}></span>
          <span class="quote-meta">
            {#if quote.kind === 'WithMessage'}
              <span class="quote-author" style:color={quote.authorDisplayColor}>
                {quote.authorDisplayName}
              </span>
            {/if}
            <span class="quote-text">{quote.text}</span>
          </span>
        </button>
      {/if}

      {#if message.isForwarded}
        <div class="forwarded">Forwarded</div>
      {/if}

      {#if message.viewType === 'Image' || message.viewType === 'Gif'}
        <ImageCell {message} />
      {:else if message.viewType === 'Video'}
        <VideoCell {message} />
      {:else if message.viewType === 'Voice'}
        <VoiceCell {message} />
      {:else if message.viewType === 'Audio'}
        <AudioCell {message} />
      {:else if message.viewType === 'Vcard'}
        <VcardCell {message} />
      {:else if message.viewType === 'File'}
        <FileCell {message} />
      {:else if message.hasLocation}
        <LocationCell {message} />
      {/if}

      {#if message.text && !cellOwnsText}
        <div class="text">
          {#each linkify(message.text) as seg, i (i)}
            {#if seg.kind === 'link'}
              <a href={seg.href} target="_blank" rel="noopener noreferrer">{seg.text}</a>
            {:else}
              {seg.text}
            {/if}
          {/each}
        </div>
      {/if}

      <div class="meta">
        {#if message.isEdited}
          <span class="edited-tag">edited</span>
        {/if}
        <span class="time" title={new Date(message.timestamp * 1000).toLocaleString()}>
          {timeLabel}
        </span>
        {#if stateGlyph}
          <span class="state {stateGlyph.kind}" aria-label={stateGlyph.kind}>
            <Icon name={stateGlyph.icon} size={12} stroke={2} />
          </span>
        {/if}
      </div>
    </div>
    <ReactionsRow {message} showCount={showReactionCount} {mediaOnly} />
  </div>
  {#if message.error && message.state === MSG_STATE.OutFailed}
    <div class="error">{message.error}</div>
  {/if}
</div>

<style>
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
    /* Flex column with align-items: flex-{start,end} makes children
     * shrink-to-content. Capping max-width here (the flex item itself)
     * lets the bubble inside expand up to 80% of the row width before
     * the text starts wrapping. */
    max-width: min(560px, 80%);
  }
  .bubble {
    padding: 8px 12px;
    border-radius: 16px;
    word-break: break-word;
    overflow-wrap: anywhere;
    line-height: 1.4;
    /* Slightly larger than the rest of the UI — chat text is what you
       actually read, so it deserves a bit more bulk than --text-md (14px). */
    font-size: var(--text-lg);
    box-shadow: 0 1px 0 var(--color-shadow);
  }
  /* Media bubbles let images/videos bleed to the top/left/right edges. The
   * inner padding is reapplied to whatever non-image content sits inside —
   * sender label (groups), quote, forwarded tag, caption, meta. When there
   * is no caption (`media-only`) the meta row floats over the image. */
  .bubble.media {
    padding: 0;
    overflow: hidden;
    position: relative;
  }
  .bubble.media > .sender,
  .bubble.media > .forwarded {
    padding: 8px 12px 0;
    margin: 0;
  }
  .bubble.media > .quote {
    margin: 8px 8px 0;
  }
  .bubble.media > .text {
    padding: 6px 12px 0;
  }
  .bubble.media > .meta {
    padding: 4px 12px 8px;
  }
  /* Caption-less media: meta floats bottom-right with a translucent backdrop
   * so it stays legible against the image. */
  .bubble.media-only > .meta {
    position: absolute;
    bottom: 6px;
    right: 8px;
    padding: 2px 6px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.55);
    color: white;
    backdrop-filter: blur(4px);
    margin: 0;
    opacity: 1;
  }
  .bubble.media-only > .meta .state.failed {
    color: #ffb3b3;
  }
  .bubble.flash {
    animation: flash 1.2s ease;
  }
  @keyframes flash {
    0% {
      box-shadow: 0 0 0 4px var(--color-accent-soft);
    }
    100% {
      box-shadow: 0 1px 0 var(--color-shadow);
    }
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
  .bubble.failed {
    background: var(--color-danger-soft, #fee);
    color: var(--color-danger, #b00);
  }
  .sender {
    font-weight: 600;
    font-size: var(--text-xs);
    margin-bottom: 2px;
  }
  .forwarded {
    font-size: var(--text-xs);
    opacity: 0.75;
    font-style: italic;
    margin-bottom: 2px;
  }
  .text {
    white-space: pre-wrap;
    user-select: text;
    -webkit-user-select: text;
    /* Body text gets a different default cursor so the user knows it's
     * the one selectable thing inside the bubble (the rest of the bubble
     * is `cursor: context-menu` from `.bubble`). */
    cursor: text;
  }
  .text a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    word-break: break-word;
  }
  .quote {
    display: flex;
    align-items: stretch;
    justify-content: flex-start;
    gap: 6px;
    margin: -2px 0 6px;
    padding: 4px 6px 4px 0;
    background: rgba(0, 0, 0, 0.06);
    border-radius: 6px;
    text-align: left;
    color: inherit;
    width: 100%;
  }
  .row.outgoing .quote {
    background: rgba(255, 255, 255, 0.18);
  }
  .quote-bar {
    width: 3px;
    border-radius: 2px;
  }
  .quote-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .quote-author {
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .quote-text {
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    justify-content: flex-end;
    font-size: 10px;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }
  .edited-tag {
    margin-right: 4px;
    font-style: italic;
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
  .error {
    color: var(--color-danger);
    font-size: var(--text-xs);
    margin-top: 2px;
    max-width: 78%;
    text-align: right;
  }
</style>
