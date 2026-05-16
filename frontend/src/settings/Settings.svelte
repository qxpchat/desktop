<script lang="ts">
  import { backToChat, mainRoute } from '../lib/state/mainRoute.svelte';
  import { rpc } from '../lib/rpc';
  import { accounts, refreshAccounts } from '../lib/state/accounts.svelte';
  import { profiles, refreshProfiles } from '../lib/state/profiles.svelte';
  import Profile from './Profile.svelte';
  import Appearance from './Appearance.svelte';
  import ChatsAndMedia from './ChatsAndMedia.svelte';
  import BlockedContacts from './BlockedContacts.svelte';
  import Backup from './Backup.svelte';
  import AddSecondDevice from './AddSecondDevice.svelte';
  import About from './About.svelte';
  import Connectivity from './Connectivity.svelte';
  import Logs from './Logs.svelte';
  import Icon, { type IconName } from '../lib/Icon.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import Button from '../lib/Button.svelte';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Section =
    | 'profile'
    | 'appearance'
    | 'chats'
    | 'blocked'
    | 'backup'
    | 'add-device'
    | 'connectivity'
    | 'logs'
    | 'about';

  // Initial section + sub-view come from the route, so external callers can
  // deep-link (e.g. the shield icon on QrShow drops the user straight into
  // Connectivity > Proxy). We snapshot once on mount — afterwards the user
  // is steering with the sidebar and we don't want the route to override.
  const initial = mainRoute.route.kind === 'settings' ? mainRoute.route : null;
  let active = $state<Section>(((initial?.section as Section) ?? 'profile'));
  let connectivitySubView = $state<string | undefined>(initial?.subView);
  let loggingOut = $state(false);
  let logoutConfirmOpen = $state(false);
  let logoutError = $state<string | null>(null);

  const sections: { id: Section; label: string; icon: IconName }[] = $derived([
    { id: 'profile', label: t('Profile'), icon: 'user' },
    { id: 'appearance', label: t('Appearance'), icon: 'palette' },
    { id: 'chats', label: t('Chats & Media'), icon: 'message-circle' },
    { id: 'connectivity', label: t('Connectivity'), icon: 'globe' },
    { id: 'blocked', label: t('Blocked'), icon: 'ban' },
    { id: 'backup', label: t('Backup'), icon: 'hard-drive' },
    { id: 'add-device', label: t('Add Second Device'), icon: 'qr-code' },
    { id: 'logs', label: t('Logs'), icon: 'file-text' },
    { id: 'about', label: t('About'), icon: 'info' },
  ]);

  let activeProfile = $derived(
    profiles.list.find((p) => p.id === accounts.selectedId) ?? null,
  );

  let logoutLabel = $derived(
    activeProfile?.displayName ?? (accounts.selectedId != null ? `account ${accounts.selectedId}` : ''),
  );

  async function doLogout() {
    const id = accounts.selectedId;
    if (id == null) return;
    loggingOut = true;
    try {
      await rpc.call('remove_account', [id]);
      await refreshAccounts();
      await refreshProfiles(accounts.configuredIds);
      backToChat();
    } catch (err) {
      logoutError = err instanceof Error ? err.message : String(err);
    } finally {
      loggingOut = false;
    }
  }
</script>

<section class="settings" data-testid="settings" data-active={active}>
  <header class="topbar" data-tauri-drag-region>
    <BackButton label={t('Back')} onclick={backToChat} data-testid="settings__back" />
    <h1>{t('Settings')}</h1>
  </header>

  <div class="body">
    <nav class="rail" aria-label={t('Settings sections')}>
      {#each sections as s}
        <button
          class:active={active === s.id}
          onclick={() => {
            active = s.id;
            connectivitySubView = undefined;
          }}
          aria-current={active === s.id ? 'page' : undefined}
          data-testid="settings__rail-item"
          data-section={s.id}
        >
          <span class="icon" aria-hidden="true"><Icon name={s.icon} size={18} /></span>
          <span>{s.label}</span>
        </button>
      {/each}
    </nav>

    <div class="content">
      <div class="section" data-testid="settings__section" data-section={active}>
        {#if active === 'profile'}
          <Profile />
        {:else if active === 'appearance'}
          <Appearance />
        {:else if active === 'chats'}
          <ChatsAndMedia />
        {:else if active === 'blocked'}
          <BlockedContacts />
        {:else if active === 'backup'}
          <Backup />
        {:else if active === 'add-device'}
          <AddSecondDevice />
        {:else if active === 'connectivity'}
          <Connectivity initialView={connectivitySubView} />
        {:else if active === 'logs'}
          <Logs />
        {:else if active === 'about'}
          <About />
        {/if}
      </div>

      <div class="logout-row">
        <Button
          variant="danger-text"
          disabled={loggingOut}
          onclick={() => (logoutConfirmOpen = true)}
          data-testid="settings__logout"
        >
          <Icon name="log-out" size={16} />
          {loggingOut ? t('Logging out…') : t('Log out')}
        </Button>
      </div>
    </div>
  </div>

  <ConfirmDialog
    open={logoutConfirmOpen}
    title={t('Log out of "{name}"?', { name: logoutLabel })}
    message={t('All local data for this account will be deleted.')}
    confirmLabel={t('Log out')}
    danger
    onConfirm={() => void doLogout()}
    onClose={() => (logoutConfirmOpen = false)}
  />

  <ConfirmDialog
    open={logoutError != null}
    mode="alert"
    title={t('Logout failed')}
    message={logoutError ?? ''}
    onClose={() => (logoutError = null)}
  />
</section>

<style>
  .settings {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: calc(var(--space-3) + var(--titlebar-gutter)) var(--space-4) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
    flex: 0 0 auto;
  }
  h1 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .body {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }
  .rail {
    width: 220px;
    flex: 0 0 auto;
    background: var(--color-bg);
    border-right: 1px solid var(--color-border);
    padding: var(--space-3);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rail button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    padding: 10px 12px;
    border-radius: 10px;
    background: transparent;
    color: var(--color-fg);
    text-align: left;
    font-size: var(--text-md);
    font-weight: 500;
    transition: background 0.1s ease;
  }
  .rail button:hover:not(.active) {
    background: var(--color-bg-hover);
  }
  .rail button.active {
    background: var(--color-bg-hover);
    color: var(--color-fg);
    font-weight: 600;
  }
  .icon {
    width: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
  }
  .section {
    flex: 1;
  }
  .logout-row {
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: flex-start;
  }
</style>
