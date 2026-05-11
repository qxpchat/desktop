<script lang="ts">
  // Unified info screen — shows contact/group/broadcast info with the right
  // affordances per chat type. Phase 15 deliverable.

  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { backToChat, setMainRoute } from '../lib/state/mainRoute.svelte';
  import { selectChat } from '../lib/state/selection.svelte';
  import { liveLocations } from '../lib/state/liveLocations.svelte';
  import Avatar from '../lib/Avatar.svelte';
  import Icon from '../lib/Icon.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = { chatId: number };
  let { chatId }: Props = $props();

  type ChatTypeStr = 'Single' | 'Group' | 'Mailinglist' | 'OutBroadcast' | 'InBroadcast';
  type FullChat = {
    id: number;
    name: string;
    isEncrypted: boolean;
    profileImage: string | null;
    archived: boolean;
    pinned: boolean;
    chatType: ChatTypeStr;
    isSelfTalk: boolean;
    contactIds: number[];
    pastContactIds: number[];
    color: string;
    isMuted: boolean;
    ephemeralTimer: number;
    selfInGroup: boolean;
  };

  type Contact = {
    id: number;
    address: string;
    color: string;
    displayName: string;
    name: string;
    profileImage: string | null;
    isVerified: boolean;
    isBlocked: boolean;
    wasSeenRecently: boolean;
  };

  type SharedChat = {
    id: number;
    name: string;
    color: string;
    profileImage: string | null;
  };

  let chat = $state<FullChat | null>(null);
  let members = $state<Contact[]>([]);
  let sharedChats = $state<SharedChat[]>([]);
  let loaded = $state(false);
  let editingName = $state(false);
  let nameInput = $state('');

  // Latest peer stream point for this chat — comes from the shared
  // liveLocations store (one bulk `get_locations` query for the whole
  // app, refreshed on `LocationChanged` events and a slow interval).
  let liveLoc = $derived(liveLocations.latest.get(chatId) ?? null);

  let liveLocOsmLink = $derived.by(() => {
    if (!liveLoc) return null;
    return `https://www.openstreetmap.org/?mlat=${liveLoc.lat}&mlon=${liveLoc.lon}#map=16/${liveLoc.lat}/${liveLoc.lon}`;
  });
  // OSM's iframe embed. Reliable from any origin (no CORS dance, no
  // separate static-map service that might be rate-limited). `bbox` is
  // a tight box around the point so zoom looks similar to a zoom-15
  // static map.
  let liveLocEmbed = $derived.by(() => {
    if (!liveLoc) return null;
    const d = 0.005;
    const bbox = [
      liveLoc.lon - d,
      liveLoc.lat - d,
      liveLoc.lon + d,
      liveLoc.lat + d,
    ].join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${liveLoc.lat},${liveLoc.lon}`;
  });

  let liveLocSender = $derived.by(() => {
    if (!liveLoc) return null;
    return members.find((m) => m.id === liveLoc.contactId);
  });

  onMount(load);
  $effect(() => {
    void chatId;
    void load();
  });

  async function load() {
    if (accounts.selectedId == null) return;
    loaded = false;
    const id = accounts.selectedId;
    chat = await rpc.call<FullChat>('get_full_chat_by_id', [id, chatId]);
    if (chat.contactIds.length > 0) {
      const map = await rpc.call<Record<number, Contact>>('get_contacts_by_ids', [
        id,
        chat.contactIds,
      ]);
      members = chat.contactIds.map((cid) => map[cid]).filter(Boolean);
    } else {
      members = [];
    }
    sharedChats = await loadSharedChats(id, chat);
    loaded = true;
  }

  // Fetches the other chats this contact is in (iOS calls it "Shared Chats").
  // Only meaningful for 1:1 chats — for groups there's no single "other".
  // Filters out the current chat so we don't list ourselves.
  async function loadSharedChats(accountId: number, c: FullChat): Promise<SharedChat[]> {
    if (c.chatType !== 'Single') return [];
    const other = c.contactIds.find((cid) => cid !== 1);
    if (other == null) return [];
    try {
      // `queryContactId` filters the chatlist to chats containing this
      // contact — same trick deltachat-ios uses (see `dc_get_chatlist`).
      const ids = await rpc.call<number[]>('get_chatlist_entries', [
        accountId,
        null,
        null,
        other,
      ]);
      const otherIds = ids.filter((id) => id !== c.id && id !== 0);
      if (otherIds.length === 0) return [];
      // `ChatListItemFetchResult` has no enum-level `rename_all` in
      // deltachat-jsonrpc, so the discriminator stays PascalCase (unlike
      // `QrObject` which is camelCased). Same convention as `event.kind`
      // in events.ts.
      type FetchItem =
        | { kind: 'ChatListItem'; id: number; name: string; color: string; avatarPath?: string | null }
        | { kind: 'ArchiveLink' }
        | { kind: 'Error' };
      const map = await rpc.call<Record<number, FetchItem>>('get_chatlist_items_by_entries', [
        accountId,
        otherIds,
      ]);
      const out: SharedChat[] = [];
      for (const id of otherIds) {
        const item = map[id];
        if (!item || item.kind !== 'ChatListItem') continue;
        out.push({
          id: item.id,
          name: item.name,
          color: item.color,
          profileImage: item.avatarPath ?? null,
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  function openSharedChat(id: number) {
    selectChat(id);
    backToChat();
  }

  let isSingle = $derived(chat?.chatType === 'Single');
  let isGroup = $derived(chat?.chatType === 'Group');
  let isBroadcast = $derived(chat?.chatType === 'OutBroadcast' || chat?.chatType === 'InBroadcast');
  let other = $derived(isSingle ? members.find((m) => m.id !== 1) ?? null : null);

  async function rename() {
    if (!chat || accounts.selectedId == null) return;
    if (!nameInput.trim()) return;
    await rpc.call('set_chat_name', [accounts.selectedId, chat.id, nameInput.trim()]);
    editingName = false;
    await load();
  }

  // Pin / mute / archive moved to the chat-list row right-click menu
  // (see `shell/ChatRowMenu.svelte`) — iOS keeps mute & archive here too,
  // but the user wants the contact page to focus on contact-shaped
  // affordances (media, members, encryption, block, delete) rather than
  // chat-list housekeeping.

  async function setEphemeral(seconds: number) {
    if (!chat || accounts.selectedId == null) return;
    await rpc.call('set_chat_ephemeral_timer', [accounts.selectedId, chat.id, seconds]);
    await load();
  }

  async function leave() {
    if (!chat || accounts.selectedId == null) return;
    if (!confirm('Leave this group? You will need to be re-invited to rejoin.')) return;
    await rpc.call('leave_group', [accounts.selectedId, chat.id]);
    backToChat();
    selectChat(null);
  }

  async function deleteChat() {
    if (!chat || accounts.selectedId == null) return;
    if (!confirm('Delete this chat from your device? Other members will keep their copy.')) return;
    await rpc.call('delete_chat', [accounts.selectedId, chat.id]);
    backToChat();
    selectChat(null);
  }

  async function blockContact() {
    if (!other || accounts.selectedId == null) return;
    if (!confirm(`Block ${other.displayName}?`)) return;
    await rpc.call('block_contact', [accounts.selectedId, other.id]);
    backToChat();
    selectChat(null);
  }

  async function removeMember(memberId: number) {
    if (!chat || accounts.selectedId == null) return;
    if (!confirm('Remove this member?')) return;
    await rpc.call('remove_contact_from_chat', [accounts.selectedId, chat.id, memberId]);
    await load();
  }

  function showMedia() {
    if (!chat) return;
    setMainRoute({ kind: 'mediaBrowser', chatId: chat.id });
  }

  function showQr() {
    if (!chat) return;
    setMainRoute({ kind: 'qrShow', chatId: chat.id });
  }

  const EPHEMERAL_OPTIONS = $derived([
    { v: 0, l: t('Off') },
    { v: 30, l: t('30 sec') },
    { v: 300, l: t('5 min') },
    { v: 3600, l: t('1 hour') },
    { v: 86400, l: t('1 day') },
    { v: 604800, l: t('1 week') },
    { v: 2592000, l: t('4 weeks') },
  ]);
</script>

<section class="info">
  <header class="topbar">
    <button class="back" onclick={backToChat} aria-label={t('Back')}>‹ {t('Back')}</button>
    <h1>{t('Info')}</h1>
  </header>

  {#if !loaded || !chat}
    <p class="muted">{t('Loading…')}</p>
  {:else}
    <div class="header">
      <Avatar
        name={chat.name || '?'}
        color={chat.color}
        imagePath={chat.profileImage}
        size={96}
        seenRecently={other?.wasSeenRecently ?? false}
      />
      {#if editingName}
        <input bind:value={nameInput} placeholder={t('Name')} />
        <div class="actions">
          <button onclick={() => (editingName = false)}>{t('Cancel')}</button>
          <button class="primary" onclick={rename}>{t('Save')}</button>
        </div>
      {:else}
        <h2>{chat.name || t('(no name)')}</h2>
        {#if isGroup || isBroadcast}
          <button class="link" onclick={() => { nameInput = chat?.name ?? ''; editingName = true; }}>{t('Rename')}</button>
        {/if}
        {#if other?.address}
          <p class="muted">{other.address}</p>
        {/if}
      {/if}
    </div>

    {#if liveLoc && liveLocEmbed && liveLocOsmLink}
      {@const minsAgo = Math.max(0, Math.floor((Date.now() / 1000 - liveLoc.timestamp) / 60))}
      <div class="live-loc">
        <div class="live-loc-head">
          <span class="live-dot" aria-hidden="true"></span>
          <span class="live-loc-title">
            {liveLocSender
              ? t('{name} is sharing live location', { name: liveLocSender.displayName || liveLocSender.address })
              : t('Live location')}
          </span>
          <span class="live-loc-ago">
            {minsAgo === 0 ? t('just now') : t('{n} min ago', { n: minsAgo })}
          </span>
        </div>
        <iframe
          class="live-loc-map"
          src={liveLocEmbed}
          title={t('Live location map')}
          loading="lazy"
          referrerpolicy="no-referrer"
        ></iframe>
        <a class="live-loc-open" href={liveLocOsmLink} target="_blank" rel="noopener noreferrer">
          {t('Open in OpenStreetMap')} ↗
        </a>
      </div>
    {/if}

    <div class="group">
      <button class="row link" onclick={showMedia}>
        <span class="label">{t('Media, Audio & Files')}</span>
        <Icon name="chevron-right" size={14} />
      </button>
      {#if (isGroup || isBroadcast) && chat.isEncrypted}
        <button class="row link" onclick={showQr}>
          <span class="label">{t('Invite QR')}</span>
          <Icon name="chevron-right" size={14} />
        </button>
      {/if}
    </div>

    <div class="group">
      <div class="row">
        <span class="label">{t('Disappearing messages')}</span>
        <select onchange={(e) => void setEphemeral(Number((e.currentTarget as HTMLSelectElement).value))} value={chat.ephemeralTimer}>
          {#each EPHEMERAL_OPTIONS as o}
            <option value={o.v}>{o.l}</option>
          {/each}
        </select>
      </div>
    </div>

    {#if isSingle && sharedChats.length > 0}
      <h3>{t('Shared Chats')}</h3>
      <div class="group">
        {#each sharedChats as s (s.id)}
          <button class="row link" onclick={() => openSharedChat(s.id)}>
            <Avatar name={s.name} color={s.color} imagePath={s.profileImage} size={32} />
            <span class="label shared-name">{s.name || t('(no name)')}</span>
            <Icon name="chevron-right" size={14} />
          </button>
        {/each}
      </div>
    {/if}

    {#if isGroup || isBroadcast}
      <h3>{t('Members')} ({members.length})</h3>
      <ul class="members">
        {#each members as m (m.id)}
          <li>
            <Avatar name={m.displayName} color={m.color} imagePath={m.profileImage} size={32} />
            <span class="m-meta">
              <span class="m-name">{m.displayName}</span>
              <span class="m-addr">{m.address}</span>
            </span>
            {#if m.id !== 1 && chat.selfInGroup}
              <button class="link-danger" onclick={() => void removeMember(m.id)}>{t('Remove')}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if isSingle && other}
      <div class="group">
        <button class="row danger-row" onclick={blockContact}>
          <span class="label">{t('Block contact')}</span>
        </button>
      </div>
    {/if}

    <div class="group">
      {#if (isGroup || isBroadcast) && chat.selfInGroup}
        <button class="row danger-row" onclick={leave}>
          <span class="label">{t('Leave')}</span>
        </button>
      {/if}
      <button class="row danger-row" onclick={deleteChat}>
        <span class="label">{t('Delete chat')}</span>
      </button>
    </div>
  {/if}
</section>

<style>
  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg);
    min-height: 56px;
    flex: 0 0 auto;
  }
  .back {
    color: var(--color-accent);
    font-size: var(--text-md);
  }
  h1 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .muted {
    color: var(--color-fg-tertiary);
    margin: 12px 0;
    text-align: center;
  }
  .header {
    text-align: center;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 22px;
  }
  .header input {
    padding: 8px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    font-size: 18px;
    text-align: center;
    margin-top: 8px;
  }
  .header .actions {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
  }
  .header .actions button {
    padding: 6px 12px;
    border-radius: var(--radius-md);
  }
  /* Signal-style sections: no card border, just spacing + a divider
     between consecutive groups. Sits inside the info pane's padding. */
  .group {
    padding: var(--space-3) var(--space-4);
  }
  .group + .group {
    border-top: 1px solid var(--color-border);
  }
  .live-loc {
    padding: var(--space-3) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .live-loc-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-success, #34c759);
    box-shadow: 0 0 0 0 currentColor;
    animation: live-pulse 1.4s ease-in-out infinite;
    color: var(--color-success, #34c759);
    flex: 0 0 auto;
  }
  @keyframes live-pulse {
    0%   { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 55%, transparent); }
    100% { box-shadow: 0 0 0 10px color-mix(in srgb, currentColor 0%, transparent); }
  }
  .live-loc-title {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .live-loc-ago {
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
    flex: 0 0 auto;
  }
  .live-loc-map {
    display: block;
    width: 100%;
    height: 180px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--color-bg-hover);
  }
  .live-loc-open {
    align-self: flex-end;
    font-size: var(--text-sm);
    color: var(--color-accent);
    text-decoration: none;
  }
  .live-loc-open:hover {
    text-decoration: underline;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    padding: 8px 0;
    min-height: 48px;
    width: 100%;
    background: transparent;
    color: var(--color-fg);
    text-align: left;
  }
  .row + .row {
    border-top: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
  }
  .row.link {
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: background 0.1s ease;
  }
  .row.link:hover {
    background: var(--color-bg-hover);
  }
  .row .label {
    flex: 1;
    min-width: 0;
  }
  .label {
    flex: 1;
  }
  .row select {
    padding: 6px 10px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
  }
  h3 {
    margin: var(--space-5) var(--space-4) var(--space-2);
    font-size: var(--text-md);
    color: var(--color-fg);
    font-weight: 600;
  }
  .shared-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .members {
    padding: 0 var(--space-4) var(--space-3);
  }
  .members li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-border);
  }
  .m-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .m-name {
    font-weight: 600;
  }
  .m-addr {
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
  }
  .link {
    background: transparent;
    color: var(--color-accent);
    padding: 0;
  }
  .link-danger {
    background: transparent;
    color: var(--color-danger);
    padding: 0;
    font-size: var(--text-sm);
  }
  .danger-row {
    color: var(--color-danger);
    cursor: pointer;
    font-weight: 500;
  }
  .danger-row:hover {
    background: var(--color-bg-hover);
  }
  .primary {
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
  }
</style>
