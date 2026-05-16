<script lang="ts">
  // Unified info screen — shows contact/group/broadcast info with the right
  // affordances per chat type. All data + mutations live in
  // `lib/state/chatInfo.svelte.ts`; this component is rendering only.

  import { accounts } from '../lib/state/accounts.svelte';
  import { backToChat, setMainRoute } from '../lib/state/mainRoute.svelte';
  import { selectChat } from '../lib/state/selection.svelte';
  import { liveLocations } from '../lib/state/liveLocations.svelte';
  import { uploadBlob } from '../lib/files';
  import {
    chatInfo,
    loadChatInfo,
    renameChat,
    setEphemeralTimer,
    leaveGroupChat,
    deleteChatLocally,
    blockChatContact,
    removeChatMember,
    findAddMemberCandidates,
    addChatMembers,
    setChatAvatar,
    type Contact,
  } from '../lib/state/chatInfo.svelte';
  import Avatar from '../lib/Avatar.svelte';
  import Icon from '../lib/Icon.svelte';
  import Modal from '../lib/Modal.svelte';
  import Button from '../lib/Button.svelte';
  import { osmEmbedUrl, osmShareUrl } from '../lib/format/openstreetmap';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = { chatId: number };
  let { chatId }: Props = $props();

  let chat = $derived(chatInfo.full);
  let members = $derived(chatInfo.members);
  let sharedChats = $derived(chatInfo.sharedChats);
  let loaded = $derived(chatInfo.loaded);

  let editingName = $state(false);
  let nameInput = $state('');

  // ---- add-member dialog ----
  let addMemberOpen = $state(false);
  let addMemberQuery = $state('');
  let addMemberPicked = $state<number[]>([]);
  let addMemberCandidates = $state<Contact[]>([]);
  let addMemberBusy = $state(false);

  // ---- avatar / cover-image edit ----
  let avatarFileInput: HTMLInputElement | undefined = $state();
  let avatarBusy = $state(false);

  // Latest peer stream point for this chat — comes from the shared
  // liveLocations store (one bulk `get_locations` query for the whole
  // app, refreshed on `LocationChanged` events and a slow interval).
  let liveLoc = $derived(liveLocations.latest.get(chatId) ?? null);

  let liveLocOsmLink = $derived(liveLoc ? osmShareUrl(liveLoc.lat, liveLoc.lon) : null);
  let liveLocEmbed = $derived(liveLoc ? osmEmbedUrl(liveLoc.lat, liveLoc.lon) : null);

  let liveLocSender = $derived.by(() => {
    if (!liveLoc) return null;
    return members.find((m) => m.id === liveLoc.contactId);
  });

  $effect(() => {
    void chatId;
    if (accounts.selectedId != null) void loadChatInfo(accounts.selectedId, chatId);
  });

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
    const name = nameInput.trim();
    if (!name) return;
    await renameChat(accounts.selectedId, chat.id, name);
    editingName = false;
  }

  async function onSetEphemeral(seconds: number) {
    if (!chat || accounts.selectedId == null) return;
    await setEphemeralTimer(accounts.selectedId, chat.id, seconds);
  }

  async function leave() {
    if (!chat || accounts.selectedId == null) return;
    if (!confirm('Leave this group? You will need to be re-invited to rejoin.')) return;
    await leaveGroupChat(accounts.selectedId, chat.id);
    backToChat();
    selectChat(null);
  }

  async function deleteChat() {
    if (!chat || accounts.selectedId == null) return;
    if (!confirm('Delete this chat from your device? Other members will keep their copy.')) return;
    await deleteChatLocally(accounts.selectedId, chat.id);
    backToChat();
    selectChat(null);
  }

  async function blockContact() {
    if (!other || accounts.selectedId == null) return;
    if (!confirm(`Block ${other.displayName}?`)) return;
    await blockChatContact(accounts.selectedId, other.id);
    backToChat();
    selectChat(null);
  }

  async function removeMember(memberId: number) {
    if (!chat || accounts.selectedId == null) return;
    if (!confirm('Remove this member?')) return;
    await removeChatMember(accounts.selectedId, chat.id, memberId);
  }

  /** Open the add-member dialog. Loads all contacts on the active account,
   *  filters out anyone already in the chat (including past members so we
   *  don't suggest re-adding someone who just got kicked — the user has to
   *  type their address fresh in that case via the compose-flow). */
  async function openAddMembers() {
    if (!chat || accounts.selectedId == null) return;
    addMemberPicked = [];
    addMemberQuery = '';
    addMemberOpen = true;
    await refreshAddMemberCandidates();
  }

  let addMemberGen = 0;
  async function refreshAddMemberCandidates() {
    if (!chat || accounts.selectedId == null) return;
    const my = ++addMemberGen;
    const list = await findAddMemberCandidates(accounts.selectedId, addMemberQuery);
    // Drop stale results — a faster keystroke during the await would
    // otherwise paint the older response on top of a newer one.
    if (my !== addMemberGen) return;
    addMemberCandidates = list;
  }

  function toggleAddMember(id: number) {
    if (addMemberPicked.includes(id)) {
      addMemberPicked = addMemberPicked.filter((x) => x !== id);
    } else {
      addMemberPicked = [...addMemberPicked, id];
    }
  }

  async function confirmAddMembers() {
    if (!chat || accounts.selectedId == null || addMemberPicked.length === 0) return;
    addMemberBusy = true;
    try {
      await addChatMembers(accounts.selectedId, chat.id, addMemberPicked);
      addMemberOpen = false;
      addMemberPicked = [];
    } catch (err) {
      alert(`Add member failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      addMemberBusy = false;
    }
  }

  /** Tap-to-edit on the group/channel avatar. Triggers the hidden file
   *  input; the change handler uploads + sets the chat profile image. */
  function pickAvatar() {
    avatarFileInput?.click();
  }

  async function onAvatarPicked(ev: Event) {
    if (!chat || accounts.selectedId == null) return;
    const target = ev.currentTarget as HTMLInputElement;
    const file = target.files?.[0];
    // Clear the input so picking the same file again re-fires `change`.
    target.value = '';
    if (!file) return;
    avatarBusy = true;
    try {
      const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
      const path = await uploadBlob(file, ext);
      await setChatAvatar(accounts.selectedId, chat.id, path);
    } catch (err) {
      alert(`Could not set image: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      avatarBusy = false;
    }
  }

  // Debounced refresh on search-input changes while the dialog is open.
  // 200 ms matches the chatlist + global-message-search debouncing. The
  // out-of-order guard lives inside refreshAddMemberCandidates (gen
  // counter), so all this effect needs to do is collapse rapid keystrokes
  // into one trailing call.
  let addMemberDebounce: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    if (!addMemberOpen) return;
    void addMemberQuery;
    if (addMemberDebounce != null) clearTimeout(addMemberDebounce);
    addMemberDebounce = setTimeout(() => {
      addMemberDebounce = null;
      void refreshAddMemberCandidates();
    }, 200);
  });

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

<section class="info" data-testid="chat-info">
  <header class="topbar" data-tauri-drag-region>
    <button class="back" onclick={backToChat} aria-label={t('Back')} data-testid="chat-info__back">‹ {t('Back')}</button>
    <h1>{t('Info')}</h1>
  </header>

  {#if !loaded || !chat}
    <p class="muted">{t('Loading…')}</p>
  {:else}
    <div class="header">
      {#if (isGroup && chat.selfInGroup) || isBroadcast}
        <button
          class="avatar-edit"
          onclick={pickAvatar}
          disabled={avatarBusy}
          aria-label={isBroadcast ? t('Change channel image') : t('Change group avatar')}
          data-testid="chat-info__avatar-edit"
        >
          <Avatar
            name={chat.name || '?'}
            color={chat.color}
            imagePath={chat.profileImage}
            size={96}
            seenRecently={false}
          />
          <span class="avatar-edit-badge" aria-hidden="true">
            <Icon name="upload" size={14} />
          </span>
        </button>
        <input
          type="file"
          accept="image/*"
          class="hidden-file"
          bind:this={avatarFileInput}
          onchange={onAvatarPicked}
          data-testid="chat-info__avatar-file-input"
        />
      {:else}
        <Avatar
          name={chat.name || '?'}
          color={chat.color}
          imagePath={chat.profileImage}
          size={96}
          seenRecently={other?.wasSeenRecently ?? false}
        />
      {/if}
      {#if editingName}
        <input bind:value={nameInput} placeholder={t('Name')} data-testid="chat-info__name-input" />
        <div class="actions">
          <Button variant="secondary" onclick={() => (editingName = false)} data-testid="chat-info__name-cancel">{t('Cancel')}</Button>
          <Button variant="primary" onclick={rename} data-testid="chat-info__name-save">{t('Save')}</Button>
        </div>
      {:else}
        <h2 data-testid="chat-info__name">{chat.name || t('(no name)')}</h2>
        {#if isGroup || isBroadcast}
          <button class="link" onclick={() => { nameInput = chat?.name ?? ''; editingName = true; }} data-testid="chat-info__rename">{t('Rename')}</button>
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
      <button class="row link" onclick={showMedia} data-testid="chat-info__media">
        <span class="label">{t('Media, Audio & Files')}</span>
        <Icon name="chevron-right" size={14} />
      </button>
      {#if (isGroup || isBroadcast) && chat.isEncrypted}
        <button class="row link" onclick={showQr} data-testid="chat-info__qr-invite">
          <span class="label">{t('Invite QR')}</span>
          <Icon name="chevron-right" size={14} />
        </button>
      {/if}
    </div>

    <div class="group">
      <div class="row">
        <span class="label">{t('Disappearing messages')}</span>
        <select onchange={(e) => void onSetEphemeral(Number((e.currentTarget as HTMLSelectElement).value))} value={chat.ephemeralTimer} data-testid="chat-info__ephemeral">
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
      <ul class="members" data-testid="chat-info__members">
        {#each members as m (m.id)}
          <li data-testid="chat-info__member" data-contact-id={m.id} data-name={m.displayName}>
            <Avatar name={m.displayName} color={m.color} imagePath={m.profileImage} size={32} />
            <span class="m-meta">
              <span class="m-name">{m.displayName}</span>
              <span class="m-addr">{m.address}</span>
            </span>
            {#if m.id !== 1 && chat.selfInGroup}
              <button class="link-danger" onclick={() => void removeMember(m.id)} data-testid="chat-info__member-remove">{t('Remove')}</button>
            {/if}
          </li>
        {/each}
      </ul>
      {#if isGroup && chat.selfInGroup}
        <div class="group">
          <button class="row link" onclick={openAddMembers} data-testid="chat-info__add-member">
            <span class="label">{t('Add members')}</span>
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      {/if}
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
        <button class="row danger-row" onclick={leave} data-testid="chat-info__leave">
          <span class="label">{t('Leave')}</span>
        </button>
      {/if}
      <button class="row danger-row" onclick={deleteChat} data-testid="chat-info__delete">
        <span class="label">{t('Delete chat')}</span>
      </button>
    </div>
  {/if}

  <Modal
    open={addMemberOpen}
    onClose={() => (addMemberOpen = false)}
    size="lg"
    ariaLabel={t('Add members')}
  >
    <div class="add-member-dialog" data-testid="chat-info__add-member-dialog">
      <h3>{t('Add members')}</h3>
      <input
        class="search"
        bind:value={addMemberQuery}
        placeholder={t('Search contacts')}
        data-testid="chat-info__add-member-search"
      />
      <ul class="picker">
        {#each addMemberCandidates as c (c.id)}
          <li>
            <button
              class="picker-row"
              class:picked={addMemberPicked.includes(c.id)}
              onclick={() => toggleAddMember(c.id)}
              data-testid="chat-info__add-member-row"
              data-contact-id={c.id}
              data-name={c.displayName}
              data-address={c.address}
            >
              <Avatar name={c.displayName} color={c.color} imagePath={c.profileImage} size={32} />
              <span class="m-meta">
                <span class="m-name">{c.displayName}</span>
                <span class="m-addr">{c.address}</span>
              </span>
              {#if addMemberPicked.includes(c.id)}
                <Icon name="check" size={16} />
              {/if}
            </button>
          </li>
        {/each}
        {#if addMemberCandidates.length === 0}
          <li class="empty">{t('No contacts to add.')}</li>
        {/if}
      </ul>
      <div class="actions">
        <Button
          variant="secondary"
          onclick={() => (addMemberOpen = false)}
          disabled={addMemberBusy}
          data-testid="chat-info__add-member-cancel"
        >{t('Cancel')}</Button>
        <Button
          variant="primary"
          onclick={confirmAddMembers}
          disabled={addMemberBusy || addMemberPicked.length === 0}
          data-testid="chat-info__add-member-confirm"
        >{addMemberBusy ? t('Adding…') : t('Add')}</Button>
      </div>
    </div>
  </Modal>
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
    font-size: var(--text-xl);
  }
  .header input {
    padding: 8px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    font-size: var(--text-lg);
    text-align: center;
    margin-top: 8px;
  }
  .header .actions {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
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
  /* --- avatar edit --- */
  .avatar-edit {
    position: relative;
    padding: 0;
    background: transparent;
    border-radius: 50%;
    cursor: pointer;
  }
  .avatar-edit:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .avatar-edit-badge {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--color-bg);
  }
  .hidden-file {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  /* --- add-member dialog --- */
  .add-member-dialog {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-height: 80vh;
  }
  .add-member-dialog h3 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .search {
    padding: 8px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    font: inherit;
  }
  .picker {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
    min-height: 60px;
  }
  .picker-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: 8px;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-fg);
    text-align: left;
  }
  .picker-row:hover {
    background: var(--color-bg-hover);
  }
  .picker-row.picked {
    background: color-mix(in srgb, var(--color-accent) 12%, transparent);
    color: var(--color-accent);
  }
  .add-member-dialog .empty {
    color: var(--color-fg-tertiary);
    padding: var(--space-3);
    text-align: center;
  }
  .add-member-dialog .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
