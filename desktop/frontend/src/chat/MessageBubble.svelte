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
  import YouTubeEmbed from './cells/YouTubeEmbed.svelte';
  import ReactionsRow from './ReactionsRow.svelte';
  import Icon, { type IconName } from '../lib/Icon.svelte';
  import { linkify } from '../lib/format/linkify';
  import { openChatByEmail } from '../lib/chatActions';
  import { detectYouTubeId } from '../lib/format/youtube';
  import { t } from '../lib/i18n/i18n.svelte';

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
    /** Open the reactor detail sheet for the tapped message. */
    onShowReactors: (messageId: number) => void;
    /** When non-null, the row is in selection mode: a circle is shown on
     *  the leading edge and clicking anywhere on the row toggles. */
    selection?: { selected: boolean; onToggle: () => void } | null;
  };

  let {
    message,
    showSender,
    showReactionCount,
    onContextMenu,
    onJumpToMessage,
    onShowReactors,
    selection = null,
  }: Props = $props();

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
    if (selection) return;
    e.preventDefault();
    onContextMenu(message, e.clientX, e.clientY);
  }

  function handleRowClick() {
    if (selection) selection.onToggle();
  }

  function handleRowKey(e: KeyboardEvent) {
    if (!selection) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      selection.onToggle();
    }
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

  // Jumbomoji — drop the bubble chrome and scale the text up when the
  // message is purely emoji (≤5 clusters, no attachment, no quote). Mirrors
  // the iOS predicate in `TextMessageCell.isEmojiOnly`.
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  let jumboCount = $derived.by(() => {
    if (mediaBubble || cellOwnsText) return 0;
    if (quote) return 0;
    const stripped = (message.text ?? '').replace(/\s+/g, '');
    if (!stripped) return 0;
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const clusters: string[] = [];
    for (const s of segmenter.segment(stripped)) {
      clusters.push(s.segment);
      if (clusters.length > 5) return 0;
    }
    if (clusters.length === 0) return 0;
    if (!clusters.every((c) => EMOJI_RE.test(c))) return 0;
    return clusters.length;
  });
  let jumbo = $derived(jumboCount > 0);
  // Multipliers mirror iOS — single-emoji is the biggest, 5+ stays compact.
  let jumboScale = $derived.by(() => {
    switch (jumboCount) {
      case 1: return 3.5;
      case 2: return 3.0;
      case 3: return 2.75;
      case 4: return 2.5;
      default: return 2.25;
    }
  });

  // Surface an inline player for any YouTube link found in the body. We
  // only embed when the bubble isn't itself a media bubble — image/video
  // attachments already dominate, and showing both would be noisy.
  let youtubeId = $derived(
    mediaBubble || jumbo ? null : detectYouTubeId(message.text ?? ''),
  );

  // Group-or-broadcast — only show sender name on incoming.
  let _ = chatlist; // referenced for future name lookups in groups
  void _;
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="row"
  class:outgoing
  class:incoming={!outgoing}
  class:selecting={selection != null}
  class:selected={selection?.selected}
  onclick={handleRowClick}
  onkeydown={handleRowKey}
  role={selection ? 'checkbox' : undefined}
  aria-checked={selection?.selected}
  tabindex={selection ? 0 : undefined}
>
  {#if selection}
    <span class="selection-circle" class:checked={selection.selected} aria-hidden="true">
      {#if selection.selected}<Icon name="check" size={14} stroke={3} />{/if}
    </span>
  {/if}
  <div class="bubble-wrap">
    <div
      class="bubble"
      class:edited={message.isEdited}
      class:failed={message.state === MSG_STATE.OutFailed}
      class:media={mediaBubble}
      class:media-only={mediaOnly}
      class:jumbo
      class:flash={highlighted}
      style:--jumbo-scale={jumboScale}
      oncontextmenu={handleContext}
      role="article"
      data-testid="message-bubble"
      data-msg-id={message.id}
      data-direction={outgoing ? 'outgoing' : 'incoming'}
      data-state={stateGlyph?.kind ?? ''}
      data-view-type={message.viewType}
      data-has-location={message.hasLocation ? 'true' : 'false'}
      data-edited={message.isEdited ? 'true' : 'false'}
      data-forwarded={message.isForwarded ? 'true' : 'false'}
    >
      {#if !outgoing && showSender && senderName}
        <div class="sender" style:color={senderColor} data-testid="message-bubble__sender">{senderName}</div>
      {/if}

      {#if quote}
        <button class="quote" onclick={onJumpQuote} type="button" data-testid="message-bubble__quote">
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
        <div class="forwarded">{t('Forwarded')}</div>
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

      {#if youtubeId}
        <YouTubeEmbed videoId={youtubeId} />
      {/if}

      {#if message.text && !cellOwnsText}
        <div class="text" data-testid="message-bubble__text">
          {#each linkify(message.text) as seg, i (i)}
            {#if seg.kind === 'link'}
              <a href={seg.href} target="_blank" rel="noopener noreferrer">{seg.text}</a>
            {:else if seg.kind === 'email'}
              <button
                type="button"
                class="email-link"
                onclick={() => void openChatByEmail(seg.address)}
                title={t('Start chat with {addr}', { addr: seg.address })}
              >{seg.text}</button>
            {:else}
              {seg.text}
            {/if}
          {/each}
        </div>
      {/if}

      <div class="meta" data-testid="message-bubble__meta">
        {#if message.isEdited}
          <span class="edited-tag">{t('edited')}</span>
        {/if}
        <span class="time" title={new Date(message.timestamp * 1000).toLocaleString()}>
          {timeLabel}
        </span>
        {#if stateGlyph}
          <span class="state {stateGlyph.kind}" aria-label={stateGlyph.kind} data-testid="message-bubble__state" data-state={stateGlyph.kind}>
            <Icon name={stateGlyph.icon} size={12} stroke={2} />
          </span>
        {/if}
      </div>
    </div>
    <ReactionsRow
      {message}
      showCount={showReactionCount}
      isGroup={showReactionCount}
      {onShowReactors}
    />
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
    position: relative;
    transition: padding-left 180ms ease, background-color 180ms ease;
  }
  .row.outgoing {
    align-items: flex-end;
  }
  .row.incoming {
    align-items: flex-start;
  }
  .row.selecting {
    padding-left: calc(var(--space-4) + 32px);
    cursor: pointer;
  }
  .row.selecting .bubble-wrap {
    /* Let the row swallow the click — inner cells (images, links, etc.)
     * would otherwise eat it before the toggle handler runs. */
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .row.selected {
    background: var(--color-accent-soft);
  }
  .selection-circle {
    position: absolute;
    left: var(--space-4);
    top: 50%;
    transform: translateY(-50%);
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--color-fg-tertiary);
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent-fg);
    transition: background-color 120ms ease, border-color 120ms ease;
  }
  .selection-circle.checked {
    background: var(--color-accent);
    border-color: var(--color-accent);
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
    padding: 8px 12px 6px;
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
  /* Jumbomoji — pure emoji messages drop the bubble chrome entirely and
   * scale the text by `--jumbo-scale` × the body font size. Mirrors iOS. */
  .bubble.jumbo {
    background: transparent !important;
    color: var(--color-fg) !important;
    box-shadow: none;
    padding: 0;
    border-radius: 0;
  }
  .row.outgoing .bubble.jumbo {
    /* Outgoing bubbles normally use the accent fill — the !important on
     * `.bubble.jumbo` above already strips it, but the accent text colour
     * leaks through and washes out the emoji on coloured backgrounds. */
    color: var(--color-fg) !important;
  }
  .bubble.jumbo > .text {
    font-size: calc(var(--text-lg) * var(--jumbo-scale, 2.5));
    line-height: 1.1;
    user-select: text;
  }
  .bubble.jumbo > .meta {
    padding: 4px 0 0;
    justify-content: flex-end;
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
  /* Jump-to-message flash ring. Colour adapts so the pulse stays
   * visible on both bubble fills: accent on the elevated incoming
   * background, white on the accent-filled outgoing bubble. */
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
  /* Bare email addresses get the same underlined-in-flow treatment as
     URLs, but as a <button> so we can hijack the click and open an in-app
     chat with that address instead of handing off to the OS mail client. */
  .text .email-link {
    background: transparent;
    border: 0;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    word-break: break-word;
    cursor: pointer;
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
