<script lang="ts">
  import { chatlist } from '../lib/state/chatlist.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import { mainRoute } from '../lib/state/mainRoute.svelte';
  import ChatView from '../chat/ChatView.svelte';
  import QrDispatcher from '../qr/QrDispatcher.svelte';
  import QrShow from '../qr/QrShow.svelte';
  import Settings from '../settings/Settings.svelte';
  import Profile from '../settings/Profile.svelte';
  import ChatInfo from '../info/ChatInfo.svelte';
  import MediaBrowser from '../info/MediaBrowser.svelte';
  import { setMainRoute } from '../lib/state/mainRoute.svelte';
  import { fileUrl } from '../lib/files';

  type Props = {
    selectedChatId: number | null;
    onSelectChat: (id: number) => void;
  };

  let { selectedChatId, onSelectChat }: Props = $props();

  let chat = $derived(selectedChatId == null ? null : (chatlist.items.get(selectedChatId) ?? null));

  let chatSubtitle = $derived.by(() => {
    if (!chat) return '';
    if (chat.isSelfTalk) return 'Saved messages';
    if (chat.isDeviceTalk) return 'Device';
    if (chat.isGroup) return chat.isEncrypted ? 'Group chat' : 'Ad-hoc group';
    return chat.isEncrypted ? 'Direct chat · encrypted' : 'Direct chat';
  });

  let showChatTopBar = $derived(mainRoute.route.kind === 'chat' && chat != null);

  function backToChatRoute() {
    mainRoute.route = { kind: 'chat' };
  }
  void backToChatRoute;
</script>

<section class="main">
  {#if showChatTopBar && chat}
    <header class="topbar">
      <button class="title-btn" onclick={() => setMainRoute({ kind: 'chatInfo', chatId: chat.id })}>
        <span class="avatar" style:background={chat.color}>
          {#if chat.avatarPath}
            <img src={fileUrl(chat.avatarPath)} alt="" />
          {:else}
            {(chat.name[0] ?? '?').toUpperCase()}
          {/if}
        </span>
        <div class="titles">
          <span class="chat-title">{chat.name || '(no name)'}</span>
          <span class="chat-status">{chatSubtitle}</span>
        </div>
      </button>
    </header>
  {/if}

  <div class="body">
    {#if mainRoute.route.kind === 'qrScan'}
      <QrDispatcher purpose={mainRoute.route.purpose} {onSelectChat} />
    {:else if mainRoute.route.kind === 'qrShow'}
      <QrShow chatId={mainRoute.route.chatId} />
    {:else if mainRoute.route.kind === 'chatInfo'}
      <ChatInfo chatId={mainRoute.route.chatId} />
    {:else if mainRoute.route.kind === 'mediaBrowser'}
      <MediaBrowser chatId={mainRoute.route.chatId} />
    {:else if mainRoute.route.kind === 'settings'}
      <Settings />
    {:else if mainRoute.route.kind === 'profileEditor'}
      <div class="profile-shell">
        <header class="profile-header">
          <button class="back" onclick={() => mainRoute.route = { kind: 'chat' }} aria-label="Back">‹ Back</button>
          <h1>Profile</h1>
        </header>
        <div class="profile-body">
          <Profile />
        </div>
      </div>
    {:else if selectedChatId != null && accounts.selectedId != null}
      {#key `${accounts.selectedId}:${selectedChatId}`}
        <ChatView accountId={accounts.selectedId} chatId={selectedChatId} />
      {/key}
    {:else}
      <div class="empty-chat">
        <div class="hint">Select a conversation</div>
        <div class="muted">Or start a new one — click the ✏︎ icon in the chat list.</div>
      </div>
    {/if}
  </div>
</section>

<style>
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    overflow: hidden;
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
  .title-btn {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 4px 8px 4px 4px;
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    text-align: left;
  }
  .title-btn:hover {
    background: var(--color-bg-hover);
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: white;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    overflow: hidden;
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .chat-title {
    font-weight: 600;
    font-size: var(--text-lg);
    color: var(--color-fg-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chat-status {
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .empty-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-6);
  }
  .hint {
    font-size: var(--text-xl);
    color: var(--color-fg);
  }
  .muted {
    color: var(--color-fg-tertiary);
    font-size: var(--text-sm);
    margin-top: var(--space-2);
  }
  .profile-shell {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .profile-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
    min-height: 56px;
  }
  .profile-header h1 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .profile-header .back {
    color: var(--color-accent);
    background: transparent;
  }
  .profile-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
  }
</style>
