<script lang="ts">
  import { profiles, CONNECTIVITY } from '../lib/state/profiles.svelte';
  import { setMainRoute, mainRoute } from '../lib/state/mainRoute.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import { rpc } from '../lib/rpc';
  import { onEvent } from '../lib/events';
  import Avatar from '../lib/Avatar.svelte';
  import Badge from '../lib/Badge.svelte';
  import ConnectionIndicator from './ConnectionIndicator.svelte';
  import Icon from '../lib/Icon.svelte';
  import MenuItem from '../lib/MenuItem.svelte';
  import Popover from '../lib/Popover.svelte';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import RailToggle from './RailToggle.svelte';
  import { t } from '../lib/i18n/i18n.svelte';
  import { isAccountMuted, setAccountMuted } from '../lib/prefs.svelte';

  type Props = {
    selectedAccountId: number;
    onSelect: (id: number) => void;
    onAddAccount: () => void;
    onRemoveAccount: (id: number) => void;
    /** Collapse the rail — the toggle lives here while the rail is open. */
    onToggleRail: () => void;
  };

  let {
    selectedAccountId,
    onSelect,
    onAddAccount,
    onRemoveAccount,
    onToggleRail,
  }: Props = $props();

  let menuFor = $state<{ id: number; x: number; y: number } | null>(null);
  let removeTarget = $state<number | null>(null);
  let hovered = $state<{ id: number; x: number; y: number } | null>(null);
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let proxyEnabled = $state(false);

  async function refreshProxyState() {
    if (accounts.selectedId == null) {
      proxyEnabled = false;
      return;
    }
    try {
      const v = await rpc.call<string | null>('get_config', [accounts.selectedId, 'proxy_enabled']);
      proxyEnabled = v === '1';
    } catch {
      /* nothing — the icon falls back to the outline form */
    }
  }
  // Switching profiles changes which account's `proxy_enabled` we mirror.
  // The effect's initial run covers mount; reading `accounts.selectedId`
  // re-runs it on profile switch. The previous account's value would
  // otherwise linger until the next ConnectivityChanged event fires
  // (which it might never, if both profiles are idle).
  $effect(() => {
    void accounts.selectedId;
    void refreshProxyState();
  });
  onEvent('ConnectivityChanged', () => void refreshProxyState());

  function rightClick(e: MouseEvent, id: number) {
    e.preventDefault();
    menuFor = { id, x: e.clientX, y: e.clientY };
  }

  function openSettings() {
    setMainRoute({ kind: 'settings' });
  }
  function openQrShow() {
    setMainRoute({ kind: 'qrShow' });
  }
  function openProxy() {
    setMainRoute({ kind: 'settings', section: 'connectivity', subView: 'proxy' });
  }

  function remove(id: number) {
    menuFor = null;
    removeTarget = id;
  }

  // Hover tooltip — 300 ms delay before showing, immediate clear on leave.
  // Anchored to the *right* of the tile (rail is the leftmost column, so
  // there's always more room to the right) with viewport clamp inside the
  // tooltip itself.
  function startHover(e: MouseEvent, id: number) {
    if (hoverTimer != null) clearTimeout(hoverTimer);
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = rect.right + 8;
    const y = rect.top + rect.height / 2;
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      hovered = { id, x, y };
    }, 300);
  }
  function endHover() {
    if (hoverTimer != null) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    hovered = null;
  }

  function toggleMute(id: number) {
    setAccountMuted(id, !isAccountMuted(id));
    menuFor = null;
  }

  /** Three visual buckets for the selected-account connectivity icon in
   *  the footer: green for any working/connected state, yellow while still
   *  connecting, red when the account isn't reaching its server. Hover-
   *  title shows the raw label. */
  function connectivityClass(c: number): 'connected' | 'connecting' | 'offline' {
    if (c >= CONNECTIVITY.Working) return 'connected';
    if (c >= CONNECTIVITY.Connecting) return 'connecting';
    return 'offline';
  }
  function connectivityLabel(c: number): string {
    if (c >= CONNECTIVITY.Connected) return t('Connected');
    if (c >= CONNECTIVITY.Working) return t('Updating…');
    if (c >= CONNECTIVITY.Connecting) return t('Connecting…');
    return t('Not connected');
  }

  // Connectivity of the *selected* profile (the rail shows one footer
  // icon for whoever the user is currently looking at, not a dot on every
  // tile). Falls through to NotConnected while the profile list is still
  // loading, so the icon doesn't flash green before data lands.
  let selectedConnectivity = $derived(
    profiles.list.find((p) => p.id === selectedAccountId)?.connectivity ??
      CONNECTIVITY.NotConnected,
  );
  let selectedConnClass = $derived(connectivityClass(selectedConnectivity));
  let selectedConnLabel = $derived(connectivityLabel(selectedConnectivity));

  function openConnectivity() {
    setMainRoute({ kind: 'settings', section: 'connectivity' });
  }
</script>

<aside class="nav" aria-label={t('Profiles')}>
  <!-- macOS title-bar drag zone — empty + draggable, mirrors the gutter
       in ChatListPane so the strip behind the rail is still a drag
       handle. -->
  <div class="titlebar-gutter" data-tauri-drag-region></div>
  <!-- Header row — mirrors ChatListPane's so the rail toggle keeps the
       same screen position when the rail opens/closes. -->
  <div class="rail-header">
    <RailToggle open onToggle={onToggleRail} />
  </div>
  <div class="accounts">
    {#each profiles.list as profile (profile.id)}
      <div class="tile-wrap">
        <button
          class="tile"
          class:selected={profile.id === selectedAccountId}
          aria-label={profile.displayName}
          aria-pressed={profile.id === selectedAccountId}
          onclick={() => onSelect(profile.id)}
          oncontextmenu={(e) => rightClick(e, profile.id)}
          onmouseenter={(e) => startHover(e, profile.id)}
          onmouseleave={endHover}
          data-testid="nav-tabs__account"
          data-account-id={profile.id}
          data-name={profile.displayName}
        >
          <Avatar
            name={profile.displayName}
            color={profile.color}
            imagePath={profile.profileImage}
            size={40}
          />
          {#if profile.id !== selectedAccountId && profile.freshCount > 0}
            <Badge
              count={profile.freshCount}
              corner
              ring="var(--color-bg)"
              data-testid="nav-tabs__account-badge"
            />
          {/if}
          {#if isAccountMuted(profile.id)}
            <span
              class="mute-glyph"
              aria-label={t('Muted')}
              title={t('Muted')}
              data-testid="nav-tabs__account-mute"
            >
              <Icon name="bell-off" size={11} />
            </span>
          {/if}
        </button>
      </div>
    {/each}

    <button class="tile add" title={t('Add account')} aria-label={t('Add account')} onclick={onAddAccount} data-testid="nav-tabs__add-account">
      <span class="add-avatar"><Icon name="plus" size={18} /></span>
    </button>
  </div>

  <div class="footer">
    <ConnectionIndicator />
    <button
      class="footer-btn conn-{selectedConnClass}"
      title={selectedConnLabel}
      aria-label={selectedConnLabel}
      onclick={openConnectivity}
      data-testid="nav-tabs__connectivity"
      data-conn-state={selectedConnClass}
    >
      <Icon name="radio-tower" size={20} />
    </button>
    <button
      class="footer-btn"
      title={proxyEnabled ? t('Proxy: On') : t('Proxy: Off')}
      aria-label={proxyEnabled ? t('Proxy on — open Proxy settings') : t('Open Proxy settings')}
      onclick={openProxy}
      data-testid="nav-tabs__proxy"
      data-proxy-enabled={proxyEnabled}
    >
      <Icon name={proxyEnabled ? 'shield-fill' : 'shield'} size={20} />
    </button>
    <button
      class="footer-btn"
      title={t('Show QR')}
      aria-label={t('Show QR')}
      class:active={mainRoute.route.kind === 'qrShow'}
      onclick={openQrShow}
      data-testid="nav-tabs__qr-show"
    >
      <Icon name="qr-code" size={20} />
    </button>
    <button
      class="footer-btn"
      title={t('Settings')}
      aria-label={t('Settings')}
      class:active={mainRoute.route.kind === 'settings'}
      onclick={openSettings}
      data-testid="nav-tabs__settings"
    >
      <Icon name="settings" size={20} />
    </button>
  </div>
</aside>

{#if menuFor != null}
  {@const m = menuFor}
  <Popover x={m.x} y={m.y} onClose={() => (menuFor = null)} ariaLabel={t('Account menu')} data-testid="nav-tabs__account-menu">
    {#if isAccountMuted(m.id)}
      <MenuItem icon="bell" label={t('Unmute')} onclick={() => toggleMute(m.id)} data-testid="nav-tabs__account-menu-unmute" />
    {:else}
      <MenuItem icon="bell-off" label={t('Mute')} onclick={() => toggleMute(m.id)} data-testid="nav-tabs__account-menu-mute" />
    {/if}
    <MenuItem icon="trash" label={t('Remove…')} danger onclick={() => remove(m.id)} data-testid="nav-tabs__account-menu-remove" />
  </Popover>
{/if}

<ConfirmDialog
  open={removeTarget != null}
  title={t('Remove this account?')}
  message={t('All local data for it will be deleted.')}
  confirmLabel={t('Remove')}
  danger
  onConfirm={() => {
    if (removeTarget != null) onRemoveAccount(removeTarget);
  }}
  onClose={() => (removeTarget = null)}
/>

{#if hovered != null}
  {@const h = hovered}
  {@const p = profiles.list.find((pp) => pp.id === h.id)}
  {#if p}
    <div
      class="hover-card"
      role="tooltip"
      style="left: {h.x}px; top: {h.y}px;"
      data-testid="nav-tabs__hover-card"
    >
      <div class="hover-name">{p.displayName}</div>
      {#if p.addr}<div class="hover-line">{p.addr}</div>{/if}
      {#if p.privateTag}<div class="hover-tag">{p.privateTag}</div>{/if}
      <div class="hover-line">{connectivityLabel(p.connectivity)}</div>
    </div>
  {/if}
{/if}

<style>
  .nav {
    flex: 0 0 var(--pane1-width);
    width: var(--pane1-width);
    display: flex;
    flex-direction: column;
    background: var(--color-bg-pane);
    border-right: 1px solid var(--color-border);
    padding-bottom: var(--space-3);
    overflow: hidden;
  }
  .titlebar-gutter {
    flex: 0 0 auto;
    height: var(--titlebar-gutter);
  }
  .rail-header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3);
    min-height: var(--pane-header-min-h);
    flex: 0 0 auto;
  }
  .accounts {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    overflow-y: auto;
    /* Without `overflow-x: clip` the rail's badge / mute glyph corners
       trigger a horizontal scrollbar in webkitgtk; `clip` suppresses h-axis
       without forcing a scrollbar (unlike `hidden`, which can still reserve
       a gutter in some engines). The native scrollbar on the y-axis is
       hidden the same way ChatListPane's list does — scroll still works. */
    overflow-x: clip;
    scrollbar-width: none;
    /* Corner badge on the avatar overhangs the tile by 4px (top: -4px in
       Badge.svelte); the first tile sits flush at the top of this scroll
       container, so the badge would clip without this padding. */
    padding: var(--space-1) var(--space-2) 0;
  }
  .accounts::-webkit-scrollbar {
    display: none;
  }
  .tile-wrap {
    position: relative;
  }
  .tile {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s ease;
    background: transparent;
  }
  .tile:hover {
    transform: scale(1.04);
  }
  .tile.selected::before {
    content: '';
    position: absolute;
    left: -8px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 26px;
    background: var(--color-accent);
    border-radius: 2px;
  }
  .mute-glyph {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--color-bg-elevated);
    border: 2px solid var(--color-bg);
    color: var(--color-fg-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .footer-btn.conn-connected,
  .footer-btn.conn-connected:hover {
    color: var(--color-success);
  }
  .footer-btn.conn-connecting,
  .footer-btn.conn-connecting:hover {
    color: var(--color-warning);
  }
  .footer-btn.conn-offline,
  .footer-btn.conn-offline:hover {
    color: var(--color-danger);
  }
  .hover-card {
    position: fixed;
    transform: translateY(-50%);
    z-index: var(--z-overlay);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px var(--color-shadow);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    min-width: 160px;
    max-width: 280px;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    /* Don't let the card fall off the right edge — small viewports collapse
       it to the available room. Y-clamping is handled by translate above. */
    max-inline-size: calc(100vw - 16px);
  }
  .hover-name {
    font-weight: 600;
    font-size: var(--text-sm);
    color: var(--color-fg);
  }
  .hover-line {
    color: var(--color-fg-secondary);
  }
  .hover-tag {
    color: var(--color-accent);
    font-weight: 500;
  }
  .add-avatar {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: transparent;
    color: var(--color-fg-secondary);
    border: 1px dashed var(--color-border-strong);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .add:hover .add-avatar {
    color: var(--color-accent);
    border-color: var(--color-accent);
  }
  .footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding-top: var(--space-3);
  }
  .footer-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    color: var(--color-fg-secondary);
    font-size: 18px;
    justify-content: center;
  }
  .footer-btn:hover,
  .footer-btn.active {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .footer-btn.active {
    color: var(--color-accent);
  }
</style>
