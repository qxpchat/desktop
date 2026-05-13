<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { refreshProfiles, profiles } from '../lib/state/profiles.svelte';
  import { uploadBlob } from '../lib/files';
  import Avatar from '../lib/Avatar.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  let displayName = $state('');
  let signature = $state('');
  let avatarPath = $state<string | null>(null);
  let saving = $state(false);
  let savedAt = $state(0);
  let loaded = $state(false);
  let avatarBusy = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  onMount(load);

  async function load() {
    if (accounts.selectedId == null) return;
    try {
      const id = accounts.selectedId;
      const [name, sig, avatar] = await Promise.all([
        rpc.call<string | null>('get_config', [id, 'displayname']),
        rpc.call<string | null>('get_config', [id, 'selfstatus']),
        rpc.call<string | null>('get_config', [id, 'selfavatar']),
      ]);
      displayName = name ?? '';
      signature = sig ?? '';
      avatarPath = avatar ?? null;
    } finally {
      loaded = true;
    }
  }

  async function save() {
    if (accounts.selectedId == null) return;
    const id = accounts.selectedId;
    saving = true;
    try {
      await rpc.call('set_config', [id, 'displayname', displayName]);
      await rpc.call('set_config', [id, 'selfstatus', signature]);
      await refreshProfiles(accounts.configuredIds);
      savedAt = Date.now();
    } finally {
      saving = false;
    }
  }

  async function onAvatarPicked(e: Event) {
    if (accounts.selectedId == null) return;
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    avatarBusy = true;
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = await uploadBlob(file, ext);
      await rpc.call('set_config', [accounts.selectedId, 'selfavatar', path]);
      avatarPath = path;
      await refreshProfiles(accounts.configuredIds);
    } catch (err) {
      alert(`${t('Could not set avatar')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      avatarBusy = false;
    }
  }

  async function removeAvatar() {
    if (accounts.selectedId == null || !avatarPath) return;
    if (!confirm(t('Remove profile picture?'))) return;
    avatarBusy = true;
    try {
      // Empty string clears the avatar in deltachat-core.
      await rpc.call('set_config', [accounts.selectedId, 'selfavatar', '']);
      avatarPath = null;
      await refreshProfiles(accounts.configuredIds);
    } catch (err) {
      alert(`${t('Could not remove avatar')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      avatarBusy = false;
    }
  }

  let recentlySaved = $derived(savedAt > 0 && Date.now() - savedAt < 2000);
</script>

<h2>{t('Profile')}</h2>

{#if !loaded}
  <p class="muted">{t('Loading…')}</p>
{:else}
  <div class="avatar-row">
    <button
      class="avatar-btn"
      onclick={() => fileInput?.click()}
      disabled={avatarBusy}
      aria-label={avatarPath ? t('Change profile picture') : t('Upload profile picture')}
      title={avatarPath ? t('Change profile picture') : t('Upload profile picture')}
    >
      <Avatar
        name={displayName}
        color={profiles.list.find((p) => p.id === accounts.selectedId)?.color ?? 'var(--color-accent)'}
        imagePath={avatarPath}
        size={96}
        alt={t('Profile avatar')}
      />
    </button>
    <div class="avatar-actions">
      <button class="link" onclick={() => fileInput?.click()} disabled={avatarBusy}>
        {avatarPath ? t('Change photo') : t('Upload photo')}
      </button>
      {#if avatarPath}
        <button class="link danger" onclick={removeAvatar} disabled={avatarBusy}>
          {t('Remove photo')}
        </button>
      {/if}
    </div>
    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      hidden
      onchange={onAvatarPicked}
    />
  </div>

  <label class="field">
    <span class="field-label">{t('Display name')}</span>
    <input bind:value={displayName} placeholder={t('Your name')} data-testid="settings-profile__name" />
  </label>

  <label class="field">
    <span class="field-label">{t('Signature')}</span>
    <textarea bind:value={signature} rows="3" placeholder={t('Shown in your contact info')} data-testid="settings-profile__signature"></textarea>
  </label>

  <div class="actions">
    <button class="primary" onclick={save} disabled={saving} data-testid="settings-profile__save">
      {saving ? t('Saving…') : recentlySaved ? t('Saved') : t('Save')}
    </button>
  </div>
{/if}

<style>
  h2 {
    margin: 0 0 var(--space-5) 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .muted {
    color: var(--color-fg-tertiary);
  }
  .avatar-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
  }
  .avatar-btn {
    position: relative;
    padding: 0;
    background: transparent;
    border-radius: 50%;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .avatar-btn:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .avatar-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }
  .avatar-actions .link {
    background: transparent;
    color: var(--color-accent);
    padding: 4px 0;
    font-size: var(--text-md);
    font-weight: 500;
    justify-content: flex-start;
  }
  .avatar-actions .link:hover:not(:disabled) {
    text-decoration: underline;
  }
  .avatar-actions .link.danger {
    color: var(--color-danger);
  }
  .avatar-actions .link:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .field {
    display: block;
    margin-bottom: var(--space-4);
    max-width: 480px;
  }
  .field-label {
    display: block;
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
    margin-bottom: 6px;
  }
  .field input,
  .field textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: inherit;
    font-size: var(--text-md);
    resize: vertical;
  }
  .field input:focus,
  .field textarea:focus {
    outline: none;
  }
  .actions {
    margin-top: var(--space-4);
    max-width: 480px;
    display: flex;
    justify-content: flex-end;
  }
  .primary {
    height: 36px;
    padding: 0 var(--space-5);
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
  }
  .primary:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
