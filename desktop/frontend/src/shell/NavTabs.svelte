<script lang="ts">
  import { profiles } from '../lib/state/profiles.svelte';
  import { setMainRoute, mainRoute } from '../lib/state/mainRoute.svelte';
  import { fileUrl } from '../lib/files';
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

  function remove(id: number) {
    menuFor = null;
    if (!confirm('Remove this account? All local data for it will be deleted.')) return;
    onRemoveAccount(id);
  }

  function initial(name: string): string {
    return name[0]?.toUpperCase() ?? '?';
  }
</script>

<aside class="nav" aria-label="Profiles">
  <div class="accounts">
    {#each profiles.list as profile (profile.id)}
      <div class="tile-wrap">
        <button
          class="tile"
          class:selected={profile.id === selectedAccountId}
          style:--tile-color={profile.color}
          title={profile.displayName}
          aria-label={profile.displayName}
          aria-pressed={profile.id === selectedAccountId}
          onclick={() => onSelect(profile.id)}
          oncontextmenu={(e) => rightClick(e, profile.id)}
        >
          {#if profile.profileImage}
            <img class="avatar img" src={fileUrl(profile.profileImage)} alt="" />
          {:else}
            <span class="avatar">{initial(profile.displayName)}</span>
          {/if}
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
      <span class="avatar add-avatar"><Icon name="plus" size={18} /></span>
    </button>
  </div>

  <div class="footer">
    <ConnectionIndicator />
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
    background: var(--color-bg);
    border-right: 1px solid var(--color-border);
    padding: var(--space-3) 0;
    overflow: hidden;
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
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: var(--tile-color);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: var(--text-lg);
    object-fit: cover;
  }
  .avatar.img {
    background: var(--color-bg-hover);
  }
  .add-avatar {
    background: transparent;
    color: var(--color-fg-secondary);
    border: 1px dashed var(--color-border-strong);
    font-size: 22px;
    font-weight: 400;
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
  }
  .collapse:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
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
