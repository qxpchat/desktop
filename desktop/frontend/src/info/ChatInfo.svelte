<script lang="ts">
  // Unified info screen — shows contact/group/broadcast info with the right
  // affordances per chat type. Phase 15 deliverable.

  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { backToChat, setMainRoute } from '../lib/state/mainRoute.svelte';
  import { selectChat } from '../lib/state/selection.svelte';
  import { fileUrl } from '../lib/files';

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
  };

  let chat = $state<FullChat | null>(null);
  let members = $state<Contact[]>([]);
  let loaded = $state(false);
  let editingName = $state(false);
  let nameInput = $state('');

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
    loaded = true;
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

  async function toggleMute() {
    if (!chat || accounts.selectedId == null) return;
    const dur = chat.isMuted ? { kind: 'notMuted' } : { kind: 'forever' };
    await rpc.call('set_chat_mute_duration', [accounts.selectedId, chat.id, dur]);
    await load();
  }

  async function togglePin() {
    if (!chat || accounts.selectedId == null) return;
    const vis = chat.pinned ? 'normal' : 'pinned';
    await rpc.call('set_chat_visibility', [accounts.selectedId, chat.id, vis]);
    await load();
  }

  async function toggleArchive() {
    if (!chat || accounts.selectedId == null) return;
    const vis = chat.archived ? 'normal' : 'archived';
    await rpc.call('set_chat_visibility', [accounts.selectedId, chat.id, vis]);
    await load();
  }

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

  const EPHEMERAL_OPTIONS = [
    { v: 0, l: 'Off' },
    { v: 30, l: '30 sec' },
    { v: 300, l: '5 min' },
    { v: 3600, l: '1 hour' },
    { v: 86400, l: '1 day' },
    { v: 604800, l: '1 week' },
    { v: 2592000, l: '4 weeks' },
  ];
</script>

<section class="info">
  <header class="topbar">
    <button class="back" onclick={backToChat} aria-label="Back">‹ Back</button>
    <h1>Info</h1>
  </header>

  {#if !loaded || !chat}
    <p class="muted">Loading…</p>
  {:else}
    <div class="header">
      <span class="avatar" style:background={chat.color}>
        {#if chat.profileImage}
          <img src={fileUrl(chat.profileImage)} alt="" />
        {:else}
          {(chat.name[0] ?? '?').toUpperCase()}
        {/if}
      </span>
      {#if editingName}
        <input bind:value={nameInput} placeholder="Name" />
        <div class="actions">
          <button onclick={() => (editingName = false)}>Cancel</button>
          <button class="primary" onclick={rename}>Save</button>
        </div>
      {:else}
        <h2>{chat.name || '(no name)'}</h2>
        {#if isGroup || isBroadcast}
          <button class="link" onclick={() => { nameInput = chat?.name ?? ''; editingName = true; }}>Rename</button>
        {/if}
        {#if other?.address}
          <p class="muted">{other.address}</p>
        {/if}
      {/if}
    </div>

    <div class="actions-grid">
      <button onclick={togglePin}>{chat.pinned ? 'Unpin' : 'Pin'}</button>
      <button onclick={toggleMute}>{chat.isMuted ? 'Unmute' : 'Mute'}</button>
      <button onclick={toggleArchive}>{chat.archived ? 'Unarchive' : 'Archive'}</button>
      <button onclick={showMedia}>Media</button>
      {#if (isGroup || isBroadcast) && chat.isEncrypted}
        <button onclick={showQr}>Invite QR</button>
      {/if}
    </div>

    <div class="row">
      <span class="label">Disappearing messages</span>
      <select onchange={(e) => void setEphemeral(Number((e.currentTarget as HTMLSelectElement).value))} value={chat.ephemeralTimer}>
        {#each EPHEMERAL_OPTIONS as o}
          <option value={o.v}>{o.l}</option>
        {/each}
      </select>
    </div>

    {#if isGroup || isBroadcast}
      <h3>Members ({members.length})</h3>
      <ul class="members">
        {#each members as m (m.id)}
          <li>
            <span class="m-avatar" style:background={m.color}>
              {(m.displayName[0] ?? '?').toUpperCase()}
            </span>
            <span class="m-meta">
              <span class="m-name">{m.displayName}</span>
              <span class="m-addr">{m.address}</span>
            </span>
            {#if m.id !== 1 && chat.selfInGroup}
              <button class="link danger" onclick={() => void removeMember(m.id)}>Remove</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <div class="footer-actions">
      {#if isSingle && other}
        <button class="danger" onclick={blockContact}>Block contact</button>
      {/if}
      {#if (isGroup || isBroadcast) && chat.selfInGroup}
        <button class="danger" onclick={leave}>Leave</button>
      {/if}
      <button class="danger" onclick={deleteChat}>Delete chat</button>
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
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
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
    border-bottom: 1px solid var(--color-border);
  }
  .avatar {
    display: inline-flex;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    color: white;
    font-size: 36px;
    font-weight: 600;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    margin-bottom: 12px;
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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
  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px;
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
  .actions-grid button {
    padding: 8px;
    border-radius: var(--radius-md);
    background: var(--color-bg-hover);
    color: var(--color-fg);
    font-weight: 500;
  }
  .actions-grid button:hover {
    background: var(--color-border);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
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
    margin: var(--space-4) var(--space-4) var(--space-2);
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
  .m-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    color: white;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
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
  .link.danger {
    color: var(--color-danger);
  }
  .footer-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-4);
  }
  .footer-actions .danger {
    padding: 10px;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-danger);
    text-align: center;
    font-weight: 500;
  }
  .footer-actions .danger:hover {
    background: var(--color-bg-hover);
  }
  .primary {
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
  }
</style>
