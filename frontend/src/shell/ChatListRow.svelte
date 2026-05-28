<script lang="ts">
  import type { ChatListItem } from '../lib/state/chatlist.svelte';
  import { formatRelativeTimestamp } from '../lib/format/timestamp';
  import { messageStateGlyph } from '../lib/state/chat.svelte';
  import Avatar from '../lib/Avatar.svelte';
  import Icon from '../lib/Icon.svelte';
  import Badge from '../lib/Badge.svelte';
  import InlineMarkdown from '../lib/InlineMarkdown.svelte';
  import { liveLocations } from '../lib/state/liveLocations.svelte';
  import { windowFocus } from '../lib/state/windowFocus.svelte';
  import { gifLabelOr } from '../lib/gifs/giphy';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    chat: ChatListItem;
    selected: boolean;
    narrow: boolean;
    /** True when the list is the dedicated archive view — suppresses the
     *  per-row "Archived" pill there (every row is archived, so it's noise;
     *  the pill earns its keep in the inbox/search listing). */
    archiveView?: boolean;
    onSelect: (id: number) => void;
    onContextMenu?: (chat: ChatListItem, x: number, y: number) => void;
  };

  let { chat, selected, narrow, archiveView = false, onSelect, onContextMenu }: Props = $props();

  let displayName = $derived(chat.name.length > 0 ? chat.name : t('(no name)'));
  let timestamp = $derived(formatRelativeTimestamp(chat.lastUpdated));

  // Swap the raw giphy URL that lands in `summaryText2` for GIF messages
  // (we send them as plain-text with the URL as body) for a media-style
  // label, matching how core summarises real Image attachments.
  let summaryBody = $derived(gifLabelOr(chat.summaryText2));
  let preview = $derived(
    chat.summaryText1.length > 0 ? `${chat.summaryText1}: ${summaryBody}` : summaryBody,
  );

  let title = $derived(narrow ? `${displayName}${preview ? ' — ' + preview : ''}` : '');

  // Suppress the unread indicator (badge + accent timestamp + narrow-mode
  // dot) only when this chat is *currently open AND the window has OS
  // focus* — i.e. the user really is reading. If they've tabbed away to
  // another app the chat may still be "selected" but they haven't
  // actually seen the new messages, so we keep the badge visible so a
  // glance back at the dock/taskbar still tells them what's new.
  let showUnread = $derived(
    chat.freshMessageCounter > 0 && !(selected && windowFocus.focused),
  );
  let peerStreaming = $derived(liveLocations.chatIds.has(chat.id));
  // A contact-request row swaps its trailing controls for a single
  // "Request" pill: the fresh-counter and delivery glyph carry no useful
  // signal for a chat the user hasn't accepted yet. Archived rows keep
  // their counter but show an "Archived" pill (except in the dedicated
  // archive view, where every row is archived).
  let isRequest = $derived(chat.isContactRequest);
  let showArchivedPill = $derived(chat.isArchived && !isRequest && !archiveView);
  // Only outgoing-state summaries get a glyph; the helper returns null for
  // incoming states (Undefined/InFresh/InNoticed/InSeen) by default.
  let stateGlyph = $derived(isRequest ? null : messageStateGlyph(chat.summaryStatus));
</script>

<button
  class="row"
  class:narrow
  class:selected
  class:muted={chat.isMuted}
  onclick={() => onSelect(chat.id)}
  oncontextmenu={(e) => {
    if (!onContextMenu) return;
    e.preventDefault();
    onContextMenu(chat, e.clientX, e.clientY);
  }}
  {title}
  aria-label={displayName}
  aria-pressed={selected}
  data-testid="chat-list-row"
  data-chat-id={chat.id}
  data-name={displayName}
>
  <div class="avatar-wrap">
    <Avatar
      name={displayName}
      color={chat.color}
      imagePath={chat.avatarPath}
      size={40}
      seenRecently={chat.wasSeenRecently}
    />
    {#if narrow && showUnread}
      <Badge
        count={chat.freshMessageCounter}
        corner
        ring="var(--color-bg-pane)"
        aria-label={t('{n} unread', { n: chat.freshMessageCounter })}
        data-testid="chat-list-row__unread"
      />
    {/if}
  </div>

  {#if !narrow}
    <span class="meta">
      <span class="row-top">
        <span class="name">
          {displayName}
          {#if chat.isMuted}
            <span class="mute" aria-label={t('muted')} title={t('Muted')} data-testid="chat-list-row__mute"><Icon name="bell-off" size={12} /></span>
          {/if}
          {#if peerStreaming}
            <span class="live" aria-label={t('Live location')} title={t('Sharing live location')} data-testid="chat-list-row__live">
              <Icon name="map-pin" size={12} stroke={2.5} />
            </span>
          {/if}
        </span>
        {#if timestamp}
          <span class="ts" class:accent={showUnread}>{timestamp}</span>
        {/if}
      </span>
      <span class="row-bottom">
        <span class="preview"><InlineMarkdown text={preview} /></span>
        {#if isRequest}
          <span class="pill request" data-testid="chat-list-row__request">{t('Request')}</span>
        {:else}
          {#if showArchivedPill}
            <span class="pill archived" data-testid="chat-list-row__archived">{t('Archived')}</span>
          {/if}
          {#if stateGlyph}
            <span
              class="state {stateGlyph.kind}"
              aria-label={stateGlyph.kind}
              data-testid="chat-list-row__state"
              data-state={stateGlyph.kind}
            >
              <Icon name={stateGlyph.icon} size={12} stroke={2} />
            </span>
          {/if}
          {#if showUnread}
            <Badge
              count={chat.freshMessageCounter}
              aria-label={t('{n} unread', { n: chat.freshMessageCounter })}
              data-testid="chat-list-row__unread"
            />
          {:else if chat.isPinned}
            <span class="pin" aria-label={t('pinned')} title={t('Pinned')} data-testid="chat-list-row__pin"><Icon name="pin" size={12} /></span>
          {/if}
        {/if}
      </span>
    </span>
  {/if}
</button>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    text-align: left;
    transition: background 0.1s ease;
  }
  .row.narrow {
    justify-content: center;
    padding: var(--space-2);
  }
  .row:hover {
    background: var(--color-bg-hover);
  }
  .row.selected {
    background: var(--color-bg-selected);
  }
  .row.muted .name {
    color: var(--color-fg-secondary);
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
  }
  .row-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    min-height: 18px;
  }
  .name {
    font-weight: 600;
    font-size: var(--text-lg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .mute {
    display: inline-flex;
    align-items: center;
    line-height: 1;
    color: var(--color-fg-tertiary);
    opacity: 0.85;
    flex: 0 0 auto;
  }
  .live {
    display: inline-flex;
    align-items: center;
    line-height: 1;
    color: var(--color-success, #34c759);
    flex: 0 0 auto;
  }
  .ts {
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }
  .ts.accent {
    color: var(--color-accent);
  }
  .preview {
    font-size: var(--text-md);
    color: var(--color-fg-secondary);
    flex: 1;
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .pin {
    font-size: 12px;
    opacity: 0.7;
  }
  .pill {
    flex: 0 0 auto;
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .pill.request {
    color: var(--color-accent-fg);
    background: var(--color-accent);
  }
  .pill.archived {
    color: var(--color-fg-secondary);
    background: var(--color-bg-hover);
  }
  .state {
    display: inline-flex;
    align-items: center;
    color: var(--color-fg-tertiary);
    flex: 0 0 auto;
  }
  .state.read {
    color: var(--color-accent);
  }
  .state.failed {
    color: var(--color-danger);
  }
  .state.pending :global(svg) {
    animation: spin-row 1.2s linear infinite;
  }
  @keyframes spin-row {
    to {
      transform: rotate(360deg);
    }
  }
  .avatar-wrap {
    position: relative;
    flex: 0 0 auto;
    display: flex;
  }
</style>
