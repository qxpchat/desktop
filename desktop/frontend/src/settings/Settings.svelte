<script lang="ts">
  import { backToChat } from '../lib/state/mainRoute.svelte';
  import { rpc } from '../lib/rpc';
  import { accounts, refreshAccounts } from '../lib/state/accounts.svelte';
  import { profiles, refreshProfiles } from '../lib/state/profiles.svelte';
  import Profile from './Profile.svelte';
  import Appearance from './Appearance.svelte';
  import ChatsAndMedia from './ChatsAndMedia.svelte';
  import BlockedContacts from './BlockedContacts.svelte';
  import Backup from './Backup.svelte';
  import About from './About.svelte';
  import Relays from './Relays.svelte';
  import Icon, { type IconName } from '../lib/Icon.svelte';

  type Section =
    | 'profile'
    | 'appearance'
    | 'chats'
    | 'blocked'
    | 'backup'
    | 'relays'
    | 'about';

  let active = $state<Section>('profile');
  let loggingOut = $state(false);

  const sections: { id: Section; label: string; icon: IconName }[] = [
    { id: 'profile', label: 'Profile', icon: 'user' },
    { id: 'appearance', label: 'Appearance', icon: 'palette' },
    { id: 'chats', label: 'Chats & Media', icon: 'message-circle' },
    { id: 'blocked', label: 'Blocked', icon: 'ban' },
    { id: 'backup', label: 'Backup', icon: 'hard-drive' },
    { id: 'relays', label: 'Relays', icon: 'globe' },
    { id: 'about', label: 'About', icon: 'info' },
  ];

  let activeProfile = $derived(
    profiles.list.find((p) => p.id === accounts.selectedId) ?? null,
  );

  async function logout() {
    const id = accounts.selectedId;
    if (id == null) return;
    const label = activeProfile?.displayName ?? `account ${id}`;
    if (!confirm(`Log out of "${label}"? All local data for this account will be deleted.`)) {
      return;
    }
    loggingOut = true;
    try {
      await rpc.call('remove_account', [id]);
      await refreshAccounts();
      await refreshProfiles(accounts.configuredIds);
      backToChat();
    } catch (err) {
      alert(`Logout failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      loggingOut = false;
    }
  }
</script>

<section class="settings">
  <header class="topbar">
    <button class="back" onclick={backToChat} aria-label="Back">
      <Icon name="chevron-left" size={16} /> Back
    </button>
    <h1>Settings</h1>
  </header>

  <div class="body">
    <nav class="rail" aria-label="Settings sections">
      {#each sections as s}
        <button
          class:active={active === s.id}
          onclick={() => (active = s.id)}
          aria-current={active === s.id ? 'page' : undefined}
        >
          <span class="icon" aria-hidden="true"><Icon name={s.icon} size={18} /></span>
          <span>{s.label}</span>
        </button>
      {/each}
    </nav>

    <div class="content">
      <div class="section">
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
        {:else if active === 'relays'}
          <Relays />
        {:else if active === 'about'}
          <About />
        {/if}
      </div>

      <div class="logout-row">
        <button class="logout" disabled={loggingOut} onclick={logout}>
          <Icon name="log-out" size={16} />
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </div>
  </div>
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
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
    min-height: 56px;
    flex: 0 0 auto;
  }
  .back {
    color: var(--color-accent);
    font-size: var(--text-md);
    display: inline-flex;
    align-items: center;
    gap: 2px;
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
    background: var(--color-bg-pane);
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
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-fg);
    text-align: left;
    font-weight: 500;
  }
  .rail button:hover {
    background: var(--color-bg-hover);
  }
  .rail button.active {
    background: var(--color-bg-selected);
    color: var(--color-accent);
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
  .logout {
    padding: 8px 16px;
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px solid var(--color-danger);
    color: var(--color-danger);
    font-weight: 600;
  }
  .logout:hover:not(:disabled) {
    background: var(--color-danger);
    color: white;
  }
  .logout:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
