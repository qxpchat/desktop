<script lang="ts">
  import { onMount } from 'svelte';
  import { profiles } from '../lib/state/profiles.svelte';
  import { setMainRoute, mainRoute } from '../lib/state/mainRoute.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import { rpc } from '../lib/rpc';
  import { onEvent } from '../lib/events';
  import Avatar from '../lib/Avatar.svelte';
  import ConnectionIndicator from './ConnectionIndicator.svelte';
  import Icon from '../lib/Icon.svelte';

  type Props = {
    selectedAccountId: number;
    onSelect: (id: number) => void;
    onCollapse: () => void;
    onAddAccount: () => void;
    onRemoveAccount: (id: number) => void;
  };

  let {
    selectedAccountId,
    onSelect,
    onCollapse,
    onAddAccount,
    onRemoveAccount,
  }: Props = $props();

  let menuFor = $state<number | null>(null);
  let proxyEnabled = $state(false);

  // Collapse is meaningful only when the main pane is showing a chat.
  // When the user is in Settings / QrShow / QrScan, hiding the profile
  // rail strands them with no way back to it (the expand button lives on
  // the chat-list pane's header, which is itself hidden by the
  // fullscreenRoute logic).
  let collapseDisabled = $derived.by(() => {
    const k = mainRoute.route.kind;
    return k === 'settings' || k === 'qrShow' || k === 'qrScan' || k === 'profileEditor';
  });

  async function refreshProxyState() {
    if (accounts.selectedId == null) return;
    try {
      const v = await rpc.call<string | null>('get_config', [accounts.selectedId, 'proxy_enabled']);
      proxyEnabled = v === '1';
    } catch {
      /* nothing — the icon falls back to the outline form */
    }
  }
  onMount(refreshProxyState);
  onEvent('ConnectivityChanged', () => void refreshProxyState());

  function rightClick(e: MouseEvent, id: number) {
    e.preventDefault();
    menuFor = id;
  }

  function openProfileEditor() {
    menuFor = null;
    setMainRoute({ kind: 'profileEditor' });
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
    if (!confirm('Remove this account? All local data for it will be deleted.')) return;
    onRemoveAccount(id);
  }

</script>

<aside class="nav" aria-label="Profiles">
  <!-- macOS title bar is `Overlay` + `hiddenTitle`, so the system
       traffic-lights float over this strip. It also serves as the window
       drag handle — wry treats mouse events on `data-tauri-drag-region`
       elements as a window drag. Keep it empty of interactive children. -->
  <div class="titlebar-gutter" data-tauri-drag-region></div>
  <div class="accounts">
    {#each profiles.list as profile (profile.id)}
      <div class="tile-wrap">
        <button
          class="tile"
          class:selected={profile.id === selectedAccountId}
          title={profile.displayName}
          aria-label={profile.displayName}
          aria-pressed={profile.id === selectedAccountId}
          onclick={() => onSelect(profile.id)}
          oncontextmenu={(e) => rightClick(e, profile.id)}
        >
          <Avatar
            name={profile.displayName}
            color={profile.color}
            imagePath={profile.profileImage}
            size={40}
          />
          {#if profile.freshCount > 0}
            <span class="badge">{profile.freshCount > 99 ? '99+' : profile.freshCount}</span>
          {/if}
        </button>
        {#if menuFor === profile.id}
          <button class="menu-backdrop" onclick={() => (menuFor = null)} aria-label="Close menu"></button>
          <div class="menu" role="menu">
            <button onclick={openProfileEditor}>Edit profile</button>
            <button onclick={() => onSelect(profile.id)}>Switch to</button>
            <button class="danger" onclick={() => remove(profile.id)}>Remove…</button>
          </div>
        {/if}
      </div>
    {/each}

    <button class="tile add" title="Add account" aria-label="Add account" onclick={onAddAccount}>
      <span class="add-avatar"><Icon name="plus" size={18} /></span>
    </button>
  </div>

  <div class="footer">
    <ConnectionIndicator />
    <button
      class="footer-btn"
      title={proxyEnabled ? 'Proxy: On' : 'Proxy: Off'}
      aria-label={proxyEnabled ? 'Proxy on — open Proxy settings' : 'Open Proxy settings'}
      onclick={openProxy}
    >
      <Icon name={proxyEnabled ? 'shield-fill' : 'shield'} size={20} />
    </button>
    <button
      class="footer-btn"
      title="Show QR"
      aria-label="Show QR"
      class:active={mainRoute.route.kind === 'qrShow'}
      onclick={openQrShow}
    >
      <Icon name="qr-code" size={20} />
    </button>
    <button
      class="footer-btn"
      title="Settings"
      aria-label="Settings"
      class:active={mainRoute.route.kind === 'settings'}
      onclick={openSettings}
    >
      <Icon name="settings" size={20} />
    </button>
    <button
      class="collapse"
      title="Collapse profile rail"
      aria-label="Collapse profile rail"
      disabled={collapseDisabled}
      onclick={onCollapse}
    >
      <Icon name="chevron-left" size={18} />
    </button>
  </div>
</aside>

<style>
  .nav {
    display: flex;
    flex-direction: column;
    width: var(--pane1-width);
    flex: 0 0 var(--pane1-width);
    background: var(--color-bg-pane);
    border-right: 1px solid var(--color-border);
    padding-bottom: var(--space-3);
    overflow: hidden;
  }
  .titlebar-gutter {
    flex: 0 0 auto;
    height: var(--titlebar-gutter);
    /* Empty by design — the macOS traffic-lights overlay it, and the rest
       of the strip is the drag handle. */
  }
  .accounts {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-2);
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
  .badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-size: var(--text-xs);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--color-bg);
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
  .collapse {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    color: var(--color-fg-secondary);
    font-size: 18px;
    line-height: 1;
    justify-content: center;
  }
  .collapse:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .collapse:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .menu-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 19;
    border: 0;
  }
  .menu {
    position: absolute;
    z-index: 20;
    left: 56px;
    top: 0;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px var(--color-shadow);
    padding: 4px;
    display: flex;
    flex-direction: column;
    min-width: 160px;
  }
  .menu button {
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-fg);
    text-align: left;
    font-size: var(--text-sm);
  }
  .menu button:hover {
    background: var(--color-bg-hover);
  }
  .menu button.danger {
    color: var(--color-danger);
  }
</style>
