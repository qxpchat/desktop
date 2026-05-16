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
  import Avatar from '../lib/Avatar.svelte';
  import Icon from '../lib/Icon.svelte';
  import { liveLocations } from '../lib/state/liveLocations.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    selectedChatId: number | null;
    onSelectChat: (id: number) => void;
  };

  let { selectedChatId, onSelectChat }: Props = $props();

  let chat = $derived(selectedChatId == null ? null : (chatlist.items.get(selectedChatId) ?? null));

  let chatSubtitle = $derived.by(() => {
    if (!chat) return '';
    if (chat.isSelfTalk) return t('Saved messages');
    if (chat.isDeviceTalk) return t('Device');
    if (chat.isGroup) return chat.isEncrypted ? t('Group chat') : t('Ad-hoc group');
    return chat.isEncrypted ? t('Direct chat · encrypted') : t('Direct chat');
  });

  let peerStreaming = $derived(
    selectedChatId != null && liveLocations.chatIds.has(selectedChatId),
  );

  let showChatTopBar = $derived(mainRoute.route.kind === 'chat' && chat != null);
</script>

<section class="main">
  {#if showChatTopBar && chat}
    <header class="topbar" data-tauri-drag-region data-testid="chat-topbar" data-chat-id={chat.id}>
      <button class="title-btn" onclick={() => setMainRoute({ kind: 'chatInfo', chatId: chat.id })} data-testid="chat-topbar__info">
        <Avatar
          name={chat.name || '?'}
          color={chat.color}
          imagePath={chat.avatarPath}
          size={36}
        />
        <div class="titles">
          <span class="chat-title" data-testid="chat-topbar__title">
            {chat.name || t('(no name)')}
            {#if chat.isMuted}
              <span class="title-icon mute" aria-label={t('Muted')} title={t('Muted')}>
                <Icon name="bell-off" size={14} />
              </span>
            {/if}
            {#if peerStreaming}
              <span class="title-icon live" aria-label={t('Live location')} title={t('Sharing live location')}>
                <Icon name="map-pin" size={14} stroke={2.5} />
              </span>
            {/if}
          </span>
          <span class="chat-status">{chatSubtitle}</span>
        </div>
      </button>
    </header>
  {/if}

  <div class="body">
    {#if mainRoute.route.kind === 'qrScan'}
      <QrDispatcher
        purpose={mainRoute.route.purpose}
        code={mainRoute.route.code}
        {onSelectChat}
      />
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
        <header class="profile-header" data-tauri-drag-region>
          <button class="back" onclick={() => mainRoute.route = { kind: 'chat' }} aria-label={t('Back')}>‹ {t('Back')}</button>
          <h1>{t('Profile')}</h1>
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
      <div class="empty-chat" data-tauri-drag-region>
        <div class="hint">{t('Select a conversation')}</div>
        <div class="muted">{t('Or start a new one — click the ✏︎ icon in the chat list.')}</div>
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
    background: var(--color-bg);
    min-height: 56px;
    flex: 0 0 auto;
  }
  .title-btn {
    display: flex;
    align-items: center;
    justify-content: flex-start;
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
  .titles {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .chat-title {
    font-weight: 600;
    font-size: var(--text-lg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .title-icon {
    display: inline-flex;
    align-items: center;
    line-height: 1;
    flex: 0 0 auto;
  }
  .title-icon.mute {
    color: var(--color-fg-tertiary);
  }
  .title-icon.live {
    color: var(--color-success, #34c759);
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
    padding: calc(var(--space-3) + var(--titlebar-gutter)) var(--space-4) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
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
