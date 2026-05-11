<script lang="ts">
  import { onMount } from 'svelte';
  import { prefs, savePrefs, accentForeground, getAccent } from '../lib/prefs.svelte';
  import { rpc, type ConnectionStatus } from '../lib/rpc';
  import { startEventLoop } from '../lib/events';
  import { startLogCapture } from '../lib/state/logs.svelte';
  import { accounts, refreshAccounts, purgeUnconfigured } from '../lib/state/accounts.svelte';
  import { chatlist, setActiveAccount } from '../lib/state/chatlist.svelte';
  import { onboarding } from '../lib/state/onboarding.svelte';
  import { selection, selectChat } from '../lib/state/selection.svelte';
  import { refreshProfiles, recomputeAllFreshCounts, profiles } from '../lib/state/profiles.svelte';
  import { setMainRoute, mainRoute } from '../lib/state/mainRoute.svelte';
  import {
    startIncomingNotifications,
    updateUnreadIndicators,
    requestPermissionOnce,
    hasAskedPermission,
  } from '../lib/notifications/notifications';
  import { bindGlobalShortcuts, onShortcut } from '../lib/shortcuts';
  import { setPaneMode, backToInbox, paneMode } from '../lib/state/paneMode.svelte';
  import { backToChat } from '../lib/state/mainRoute.svelte';
  import { loadPreferredLocale, t } from '../lib/i18n/i18n.svelte';
  import NavTabs from './NavTabs.svelte';
  import ChatListPane from './ChatListPane.svelte';
  import MainPane from './MainPane.svelte';
  import Splitter from './Splitter.svelte';
  import Onboarding from '../onboarding/Onboarding.svelte';
  import Logo from '../lib/Logo.svelte';
  import ImageLightbox from '../chat/ImageLightbox.svelte';

  // Pane-2 width has two valid modes:
  //   - Narrow (pfp-only) at exactly NARROW_W.
  //   - Wide (full chat rows) in [MIN_WIDE_W, MAX_W].
  // The splitter passes the cumulative drag delta (from `onStart` to the
  // current pointer position) so snap decisions can be made on the user's
  // INTENT, not on the residual width after clamping. Without this, the
  // pane would get stuck once it collapsed to narrow.
  const NARROW_W = 72;
  const MIN_WIDE_W = 240;
  const MAX_W = 520;
  let dragOriginWidth = 0;

  let connectionStatus = $state<ConnectionStatus>('idle');

  // Mirror the persisted theme + accent + text-scale onto <html>. Accent
  // is per-profile (see prefs.accentByAccount), so this effect re-runs on
  // account switch via the `accounts.selectedId` read. Accent foreground
  // is computed from luminance instead of leaving the static `#0a0a0a`
  // from theme.css — otherwise dark accent hues (blue, indigo, purple,
  // pink, red) end up with near-black text on a near-black bg.
  $effect(() => {
    const accent = getAccent(accounts.selectedId);
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.style.setProperty('--color-accent', accent);
    document.documentElement.style.setProperty('--color-accent-fg', accentForeground(accent));
    document.documentElement.style.setProperty('--text-scale', String(prefs.textScale));
  });

  // Re-fetch the chatlist whenever the active account changes; clear chat
  // selection because chat ids are scoped per account.
  $effect(() => {
    setActiveAccount(accounts.selectedId);
  });
  $effect(() => {
    void chatlist.accountId;
    selectChat(null);
  });

  // Re-fetch profile metadata whenever the configured-account set changes —
  // covers add-account, remove-account, and onboarding completion.
  let lastProfilesKey = '';
  $effect(() => {
    const key = accounts.configuredIds.join(',');
    if (key !== lastProfilesKey) {
      lastProfilesKey = key;
      void refreshProfiles(accounts.configuredIds);
    }
  });

  // Page title + favicon track total unread across accounts.
  $effect(() => {
    const total = profiles.list.reduce((sum, p) => sum + p.freshCount, 0);
    updateUnreadIndicators(total);
  });

  let didInitialPurge = false;

  onMount(() => {
    const unsub = rpc.onStatus(async (s) => {
      connectionStatus = s;
      if (s === 'connected') {
        await refreshAccounts();
        await refreshProfiles(accounts.configuredIds);
        // Once per page load, while no flow is active, drop half-configured
        // accounts left over from a previously-interrupted onboarding.
        if (!didInitialPurge && onboarding.phase.kind === 'idle') {
          didInitialPurge = true;
          await purgeUnconfigured();
        }
        startEventLoop();
        startLogCapture();
        // Onboarding flows call `start_io` for the account they just
        // configured, but nothing kicks the scheduler for accounts that
        // were already configured on a prior session — so a freshly-opened
        // app sat idle with IMAP off. `start_io_for_all_accounts` is the
        // bulk variant; safe to re-call (no-op if already running) and
        // also catches daemon reconnects since this whole block re-runs
        // on every `'connected'` transition.
        try {
          await rpc.call('start_io_for_all_accounts');
        } catch (err) {
          console.warn('start_io_for_all_accounts failed', err);
        }
        startIncomingNotifications();
        // Ask once for browser-notification permission after onboarding.
        if (accounts.configuredIds.length > 0 && !hasAskedPermission()) {
          void requestPermissionOnce();
        }
      }
    });
    void loadPreferredLocale(prefs.language);
    rpc.connect();
    const unbindShortcuts = bindGlobalShortcuts();
    const unsubNew = onShortcut('new-chat', () => setPaneMode({ kind: 'compose' }));
    const unsubEsc = onShortcut('escape', () => {
      backToInbox();
      backToChat();
    });
    return () => {
      unsub();
      unbindShortcuts();
      unsubNew();
      unsubEsc();
    };
  });

  // Routes that take over the entire content area (pane 2 + pane 3) — used
  // for full-screen views where the chat list is irrelevant.
  let fullscreenRoute = $derived.by(() => {
    const k = mainRoute.route.kind;
    return k === 'settings' || k === 'profileEditor' || k === 'qrShow' || k === 'qrScan';
  });

  function startSplitter() {
    dragOriginWidth = prefs.pane2Width;
  }
  function moveSplitter(totalDx: number) {
    const next = dragOriginWidth + totalDx;
    if (dragOriginWidth === NARROW_W) {
      // Started narrow: snap back to wide only once the user has dragged
      // past MIN_WIDE_W. Smaller drags leave the pane narrow.
      prefs.pane2Width = next >= MIN_WIDE_W ? Math.min(MAX_W, next) : NARROW_W;
    } else {
      // Started wide: any drag below MIN_WIDE_W collapses to narrow.
      prefs.pane2Width = next < MIN_WIDE_W ? NARROW_W : Math.min(MAX_W, next);
    }
    savePrefs();
  }
  function endSplitter() {
    dragOriginWidth = 0;
  }

  // Compose / chooseMembers / setGroupMetadata all need the wide pane to
  // be usable — collapsing back to pfp-only width without exiting those
  // sub-flows would leave the user staring at a 72px contact picker. Snap
  // any active compose flow back to the inbox when the chat list goes
  // narrow.
  $effect(() => {
    if (prefs.pane2Width === NARROW_W && paneMode.mode.kind !== 'inbox' && paneMode.mode.kind !== 'archive') {
      backToInbox();
    }
  });

  function togglePane1() {
    prefs.pane1Collapsed = !prefs.pane1Collapsed;
    savePrefs();
  }

  let showAddAccountOnboarding = $state(false);
  let prevConfiguredCount = 0;
  $effect(() => {
    const now = accounts.configuredIds.length;
    if (showAddAccountOnboarding && now > prevConfiguredCount) {
      showAddAccountOnboarding = false;
    }
    prevConfiguredCount = now;
  });
  function addAccount() {
    showAddAccountOnboarding = true;
  }

  async function removeAccount(id: number) {
    try {
      await rpc.call('remove_account', [id]);
      await refreshAccounts();
      await refreshProfiles(accounts.configuredIds);
    } catch (err) {
      alert(`Could not remove account: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function selectAccount(id: number) {
    if (id === accounts.selectedId) return;
    try {
      await rpc.call('select_account', [id]);
      accounts.selectedId = id;
      setMainRoute({ kind: 'chat' });
      // Recompute every profile's fresh count: opening the new active profile
      // will notice messages (dropping its badge to 0), and the just-left
      // profile might not get a DC event for some time.
      void recomputeAllFreshCounts();
    } catch (err) {
      console.warn('select_account failed', err);
    }
  }
</script>

{#if !accounts.loaded || connectionStatus !== 'connected'}
  <div class="boot">
    <div class="boot-content">
      <div class="boot-logo">
        <Logo size="clamp(96px, 22vw, 168px)" />
      </div>
      <div class="boot-title">qxp</div>
      <div class="boot-status">
        {#if connectionStatus === 'connecting' || connectionStatus === 'idle'}
          {t('Connecting…')}
        {:else if connectionStatus === 'disconnected'}
          {t('Disconnected — retrying…')}
        {:else}
          {t('Loading…')}
        {/if}
      </div>
    </div>
  </div>
{:else if accounts.configuredIds.length === 0 || showAddAccountOnboarding}
  <Onboarding />
  {#if showAddAccountOnboarding && accounts.configuredIds.length > 0}
    <button class="onboarding-back" onclick={() => (showAddAccountOnboarding = false)}>← {t('Back')}</button>
  {/if}
{:else}
  <div class="shell">
    {#if !prefs.pane1Collapsed && !fullscreenRoute}
      <NavTabs
        selectedAccountId={accounts.selectedId ?? 0}
        onSelect={selectAccount}
        onAddAccount={addAccount}
        onRemoveAccount={(id) => void removeAccount(id)}
      />
    {/if}

    {#if !fullscreenRoute}
      <ChatListPane
        width={prefs.pane2Width}
        selectedChatId={selection.chatId}
        onSelectChat={selectChat}
        railOpen={!prefs.pane1Collapsed}
        onToggleRail={togglePane1}
        onUncollapse={() => {
          prefs.pane2Width = MIN_WIDE_W;
          savePrefs();
        }}
      />

      <Splitter onStart={startSplitter} onMove={moveSplitter} onEnd={endSplitter} />
    {/if}

    <MainPane selectedChatId={selection.chatId} onSelectChat={selectChat} />
  </div>
{/if}

<ImageLightbox />

<style>
  .shell {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }
  .boot {
    height: 100vh;
    width: 100vw;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
    color: var(--color-fg);
  }
  .boot-content {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .boot-logo {
    color: var(--color-accent);
    line-height: 0;
  }
  .boot-title {
    font-size: clamp(28px, 6vw, 44px);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .boot-status {
    color: var(--color-fg-secondary);
    font-size: var(--text-md);
    margin-top: var(--space-2);
  }
  .onboarding-back {
    position: fixed;
    top: calc(var(--titlebar-gutter) + var(--space-2));
    left: var(--space-3);
    padding: 8px 14px;
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    font-weight: 600;
    z-index: 100;
  }
  .onboarding-back:hover {
    background: var(--color-bg-hover);
  }
</style>
