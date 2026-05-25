<script lang="ts">
  import { CONTACT_ID_SELF, MSG_STATE, chat, messageReactions, messageStateGlyph, type Message } from '../lib/state/chat.svelte';
  import { chatlist } from '../lib/state/chatlist.svelte';
  import { formatShortTime } from '../lib/format/timestamp';
  import ImageCell from './cells/ImageCell.svelte';
  import VideoCell from './cells/VideoCell.svelte';
  import FileCell from './cells/FileCell.svelte';
  import VcardCell from './cells/VcardCell.svelte';
  import LocationCell from './cells/LocationCell.svelte';
  import AudioCell from './cells/AudioCell.svelte';
  import VoiceCell from './cells/VoiceCell.svelte';
  import YouTubeEmbed from './cells/YouTubeEmbed.svelte';
  import ReactionsRow from './ReactionsRow.svelte';
  import Icon from '../lib/Icon.svelte';
  import { linkify } from '../lib/format/linkify';
  import InlineMarkdown from '../lib/InlineMarkdown.svelte';
  import { openChatByEmail } from '../lib/chatActions';
  import { openFullMessage } from '../lib/state/fullMessage.svelte';
  import { detectYouTubeId } from '../lib/format/youtube';
  import { fileUrl } from '../lib/files';
  import { gifLabelOr, isGiphyUrl } from '../lib/gifs/giphy';
  import { cacheGif } from '../lib/gifs/cache';
  import {
    getRecent,
    markGifMessageSeen,
    recordGifUse,
  } from '../lib/gifs/recents.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    message: Message;
    /** Show sender name+stripe (true in groups & broadcasts). */
    showSender: boolean;
    /** Show per-emoji counter on reaction chips (true in groups; false in 1:1). */
    showReactionCount: boolean;
    /** Open the context menu anchored at the click coords. `mode` selects
     *  which sections of the menu to render — defaults to 'all' for the
     *  right-click flow; the hover icons pass 'reactions' or 'actions'. */
    onContextMenu: (msg: Message, x: number, y: number, mode?: 'all' | 'reactions' | 'actions') => void;
    /** Start replying to this message (composer quote bar). Wired from the
     *  hover reply icon next to each bubble. */
    onReply: (msgId: number) => void;
    /** Jump to and highlight a quoted message. */
    onJumpToMessage: (msgId: number) => void;
    /** Open the reactor detail sheet for the tapped message. */
    onShowReactors: (messageId: number) => void;
    /** Run-grouping flags. A run is a sequence of consecutive messages
     *  from the same sender. The first bubble of a run keeps its top
     *  screen-edge corner rounded + the tail cue; the last keeps the
     *  bottom one. Corners abutting a same-sender neighbour go flat so
     *  the run reads as one merged column. A standalone message is both
     *  start and end. */
    groupStart?: boolean;
    groupEnd?: boolean;
    /** When non-null, the row is in selection mode: a circle is shown on
     *  the leading edge and clicking anywhere on the row toggles. */
    selection?: { selected: boolean; onToggle: () => void } | null;
    /** Message id currently under the cursor. ChatView tracks this with a
     *  single mousemove + scroll-driven hit-test on the scroller and pushes
     *  it down; we use it instead of per-row CSS `:hover`, which got pinned
     *  by Popover backdrops and never updated on scroll under a stationary
     *  cursor. The full row (`data-row-msg-id` on `.row`) is the hit zone,
     *  so hovering anywhere in the row's vertical band reveals the trio. */
    hoveredId?: number | null;
  };

  let {
    message,
    showSender,
    showReactionCount,
    onContextMenu,
    onReply,
    onJumpToMessage,
    onShowReactors,
    groupStart = true,
    groupEnd = true,
    selection = null,
    hoveredId = null,
  }: Props = $props();

  let hovered = $derived(hoveredId === message.id);

  let outgoing = $derived(message.fromId === CONTACT_ID_SELF);

  // Tile cells (file/voice/vcard/location) are parameterized with a
  // bg/fg/accent triple so they render correctly on either bubble fill.
  // The tile itself is transparent — these tokens only colour the inner
  // puck and text. `bg` is the bubble fill behind the tile and doubles as
  // the puck-icon colour (cutout look). On outgoing bubbles the app accent
  // IS the bubble fill, so the puck flips to the accent-fg colour to stay
  // visible instead of vanishing into the background.
  let cellBg = $derived(outgoing ? 'var(--color-accent)' : 'var(--color-bg-elevated)');
  let cellFg = $derived(outgoing ? 'var(--color-accent-fg)' : 'var(--color-fg)');
  let cellAccent = $derived(outgoing ? 'var(--color-accent-fg)' : 'var(--color-accent)');

  let highlighted = $derived(chat.highlightId === message.id);
  let stateGlyph = $derived(outgoing ? messageStateGlyph(message.state) : null);
  let timeLabel = $derived(formatShortTime(message.timestamp));

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

  // Hover-icon handlers — Signal-style trio (react / reply / menu) sits
  // beside each bubble and appears on row hover. Coords are taken from the
  // button's bounding rect so the popover anchors to the button instead of
  // the cursor, even when the click is keyboard-driven.
  function openHoverPopover(e: MouseEvent | KeyboardEvent, mode: 'reactions' | 'actions') {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // For outgoing bubbles the buttons sit on the right edge of the bubble
    // (visual left of the bubble itself when row-reverse is applied). The
    // popover is wider than the button — anchor on the right edge so it
    // doesn't immediately hit the viewport clamp.
    const x = outgoing ? Math.max(0, r.right - 220) : r.left;
    onContextMenu(message, x, r.bottom + 4, mode);
  }
  function onReactClick(e: MouseEvent) {
    e.stopPropagation();
    openHoverPopover(e, 'reactions');
  }
  function onReplyClick(e: MouseEvent) {
    e.stopPropagation();
    onReply(message.id);
  }
  function onMenuClick(e: MouseEvent) {
    e.stopPropagation();
    openHoverPopover(e, 'actions');
  }

  function handleRowClick() {
    if (selection) selection.onToggle();
  }


  // `hasHtml` is set by core whenever the stored text is not the whole
  // message — either the body was truncated past 38 lines / 100 chars/line,
  // or the email carried a real HTML part. Either way the untruncated body
  // is fetchable via `get_message_html`; surface a "Show full message" link.
  function showFullMessage() {
    const accountId = chat.active?.accountId;
    if (accountId == null) return;
    void openFullMessage(accountId, message.id, message.subject);
  }

  function handleRowKey(e: KeyboardEvent) {
    if (!selection) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      selection.onToggle();
    }
  }


  // A Text message whose entire body is a giphy URL gets rendered inline as
  // an animated image. It rides the same `.media` bubble chrome as real
  // Image attachments so the styling reads identically — flush edges, meta
  // floating over the bottom-right of the image.
  let isGifMessage = $derived(
    message.viewType === 'Text' && isGiphyUrl(message.text ?? ''),
  );

  // Bubble width / shape for media-only.
  let mediaBubble = $derived(
    message.viewType === 'Image' ||
      message.viewType === 'Gif' ||
      message.viewType === 'Video' ||
      isGifMessage,
  );
  /** True when the bubble is media (image/video) without a caption — the meta
   *  row floats over the bottom-right corner of the image instead of sitting
   *  in its own padded section below. Giphy GIFs always count as caption-less
   *  (their `text` is the URL, not a user-authored caption). */
  let mediaOnly = $derived(mediaBubble && (isGifMessage || !message.text));
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

  // Inline GIF rendering state. `isGifMessage` is computed earlier so it can
  // feed into `mediaBubble` / `mediaOnly`; here we just need the resolved
  // local path (or load error) for the actual <img>.
  let gifLocalPath = $state<string | null>(null);
  let gifError = $state<string | null>(null);

  $effect(() => {
    if (!isGifMessage) {
      gifLocalPath = null;
      gifError = null;
      return;
    }
    const url = (message.text ?? '').trim();
    const accountId = chat.active?.accountId;
    if (accountId == null) return;

    // Reuse a previously-cached path from recents when available — both
    // the picker and prior renders populate it, so common-case render is
    // a single recents lookup.
    const existing = getRecent(accountId, url);
    if (existing?.localPath) {
      gifLocalPath = existing.localPath;
      if (markGifMessageSeen(accountId, message.id)) {
        recordGifUse(accountId, {
          url,
          term: existing.term,
          localPath: existing.localPath,
        });
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const path = await cacheGif(url);
        if (cancelled) return;
        gifLocalPath = path;
        if (markGifMessageSeen(accountId, message.id)) {
          recordGifUse(accountId, { url, term: '', localPath: path });
        }
      } catch (e) {
        if (cancelled) return;
        gifError = e instanceof Error ? e.message : String(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  // Surface an inline player for any YouTube link found in the body. We
  // only embed when the bubble isn't itself a media bubble — image/video
  // attachments already dominate, and showing both would be noisy. (Giphy
  // GIF messages already flip `mediaBubble` true, so this gate covers them.)
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
  class:group-start={groupStart}
  class:group-end={groupEnd}
  class:selecting={selection != null}
  class:selected={selection?.selected}
  class:hovered
  data-row-msg-id={message.id}
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
  <div class="bubble-row">
    {#if !selection}
      <div class="hover-buttons" data-testid="message-hover-actions" aria-hidden="true">
        <button
          type="button"
          class="hover-btn"
          aria-label={t('React')}
          data-testid="message-hover-actions__react"
          onclick={onReactClick}
        >
          <Icon name="smile-plus" size={16} />
        </button>
        <button
          type="button"
          class="hover-btn"
          aria-label={t('Reply')}
          data-testid="message-hover-actions__reply"
          onclick={onReplyClick}
        >
          <Icon name="reply" size={16} />
        </button>
        <button
          type="button"
          class="hover-btn"
          aria-label={t('More')}
          data-testid="message-hover-actions__menu"
          onclick={onMenuClick}
        >
          <Icon name="more-horizontal" size={16} />
        </button>
      </div>
    {/if}
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
            <span class="quote-text">{gifLabelOr(quote.text)}</span>
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
        <VoiceCell {message} bg={cellBg} fg={cellFg} accent={cellAccent} />
      {:else if message.viewType === 'Audio'}
        <AudioCell {message} />
      {:else if message.viewType === 'Vcard'}
        <VcardCell {message} bg={cellBg} fg={cellFg} accent={cellAccent} />
      {:else if message.viewType === 'File'}
        <FileCell {message} bg={cellBg} fg={cellFg} accent={cellAccent} />
      {:else if message.hasLocation}
        <LocationCell {message} bg={cellBg} fg={cellFg} accent={cellAccent} />
      {/if}

      {#if youtubeId}
        <YouTubeEmbed videoId={youtubeId} />
      {/if}

      {#if isGifMessage}
        {#if gifLocalPath}
          <img
            class="gif"
            src={fileUrl(gifLocalPath)}
            alt={t('GIF')}
            data-testid="message-bubble__gif"
          />
        {:else if gifError}
          <div class="gif-failed" data-testid="message-bubble__gif-failed">
            <Icon name="alert-circle" size={16} />
            <span>{t('GIF unavailable')}</span>
          </div>
        {:else}
          <div class="gif-loading" data-testid="message-bubble__gif-loading">
            <Icon name="loader" size={18} />
          </div>
        {/if}
      {:else if message.text && !cellOwnsText}
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
              <InlineMarkdown text={seg.text} />
            {/if}
          {/each}
        </div>
      {/if}

      {#if message.hasHtml}
        <button
          type="button"
          class="show-full"
          onclick={showFullMessage}
          data-testid="message-bubble__show-full"
        >{t('Show full message')}</button>
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
  </div>
  <ReactionsRow
    reactions={messageReactions(message)}
    messageId={message.id}
    showCount={showReactionCount}
    isGroup={showReactionCount}
    {onShowReactors}
  />
  {#if message.error && message.state === MSG_STATE.OutFailed}
    <div class="error">{message.error}</div>
  {/if}
</div>

<style>
  .row {
    display: flex;
    flex-direction: column;
    /* Tight gap by default so consecutive same-sender bubbles read as one
     * merged run; `.group-start` reopens the gap above a new run. */
    padding: 1px var(--space-4);
    max-width: 100%;
    position: relative;
    transition: padding-left 180ms ease, background-color 180ms ease;
  }
  .row.group-start {
    padding-top: 8px;
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
  .row.selecting .bubble-row {
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
  /* Horizontal pairing of the hover trio with the bubble. Capped narrower
   * than the bubble's own old max-width (80%) so the trio always fits on
   * the inboard side without pushing the bubble past the chat pane edge.
   * Incoming runs left→right (bubble, then buttons on the outboard side);
   * outgoing flips so the buttons sit between bubble and pane interior. */
  .bubble-row {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: min(520px, 75%);
    min-width: 0;
  }
  /* DOM order: [hover-buttons, bubble]. For outgoing (row right-aligned)
   * that puts buttons on the bubble's left = inboard. For incoming
   * (left-aligned) we need the reverse so buttons end up on the bubble's
   * right = inboard. */
  .row.incoming .bubble-row {
    flex-direction: row-reverse;
  }
  /* `.bubble` is a flex item now; `min-width: 0` lets it shrink past its
   * intrinsic content width so long lines wrap inside the bubble instead
   * of forcing the row past `.bubble-row`'s max-width. */
  .bubble-row > .bubble {
    min-width: 0;
  }
  .hover-buttons {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex: none;
    opacity: 0;
    pointer-events: none;
  }
  /* Reveal driven by `hoveredMsgId` in ChatView (single mousemove tracker
   * on the scroller, re-hit-tested on scroll). The whole `.row` is the
   * hit zone — hovering anywhere in the row's vertical band lights up
   * the trio. CSS `:hover` was unreliable here: Popover backdrops left
   * the row pinned-hovered until the user moved the cursor, and scrolling
   * under a stationary cursor never updated `:hover` at all. */
  .row.hovered .hover-buttons {
    opacity: 1;
    pointer-events: auto;
  }
  .hover-btn {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--color-fg-tertiary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 120ms ease, color 120ms ease;
  }
  .hover-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .hover-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
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
  }
  .row.incoming .bubble {
    background: var(--color-bg-elevated);
    color: var(--color-fg);
  }
  /* Run grouping — the tail cue sits on the run's outer (screen-edge)
     corner: bottom-right for the last outgoing bubble, top-left for the
     first incoming one. Corners abutting a same-sender neighbour collapse
     to 0 so the run reads as one merged column. Inner-side corners (away
     from the screen edge) stay at the base 16px. */
  .row.outgoing.group-end .bubble {
    border-bottom-right-radius: 2px;
  }
  .row.outgoing:not(.group-end) .bubble {
    border-bottom-right-radius: 0;
  }
  .row.outgoing:not(.group-start) .bubble {
    border-top-right-radius: 0;
  }
  .row.incoming.group-start .bubble {
    border-top-left-radius: 2px;
  }
  .row.incoming:not(.group-start) .bubble {
    border-top-left-radius: 0;
  }
  .row.incoming:not(.group-end) .bubble {
    border-bottom-left-radius: 0;
  }
  .bubble.failed {
    background: var(--color-danger-soft);
    color: var(--color-danger);
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
  /* Inline GIF — `isGifMessage` flips the bubble into `.media` chrome
   * (padding 0, overflow hidden), so this <img> is allowed to bleed to the
   * bubble edges. Matches `cells/ImageCell.svelte`'s rule shape so a real
   * Image attachment and a giphy GIF look identical in the timeline. */
  .gif {
    display: block;
    width: 100%;
    max-height: 50vh;
    object-fit: cover;
    background: var(--color-bg-hover);
    border-radius: 0;
  }
  .gif-loading,
  .gif-failed {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: var(--space-3);
    color: var(--color-fg-tertiary);
    font-size: var(--text-sm);
  }
  .gif-loading :global(svg) {
    animation: spin 1.2s linear infinite;
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
  /* "Show full message" — sits between the truncated body and the meta row,
     right-aligned. Accent-coloured so it reads as an action. On outgoing
     bubbles the accent IS the fill, so flip to the accent-fg colour. */
  .show-full {
    display: block;
    width: fit-content;
    margin: 4px 0 0 auto;
    padding: 0;
    background: transparent;
    border: 0;
    color: var(--color-accent);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .row.outgoing .show-full {
    color: var(--color-accent-fg);
  }
  .show-full:hover {
    opacity: 0.8;
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
