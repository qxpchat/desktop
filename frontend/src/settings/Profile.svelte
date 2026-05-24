<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { refreshProfiles, profiles } from '../lib/state/profiles.svelte';
  import { uploadBlob } from '../lib/files';
  import Avatar from '../lib/Avatar.svelte';
  import Button from '../lib/Button.svelte';
  import TextInput from '../lib/TextInput.svelte';
  import SettingsSection from '../lib/SettingsSection.svelte';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import ImageCropperDialog from '../lib/ImageCropperDialog.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  let displayName = $state('');
  let signature = $state('');
  let privateTag = $state('');
  let avatarPath = $state<string | null>(null);
  let saving = $state(false);
  let savedAt = $state(0);
  let loaded = $state(false);
  let avatarBusy = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let removeAvatarOpen = $state(false);
  let errorMsg = $state<string | null>(null);
  let cropSrc = $state<string | null>(null);

  onMount(load);

  async function load() {
    if (accounts.selectedId == null) return;
    try {
      const id = accounts.selectedId;
      const [name, sig, avatar, tag] = await Promise.all([
        rpc.call<string | null>('get_config', [id, 'displayname']),
        rpc.call<string | null>('get_config', [id, 'selfstatus']),
        rpc.call<string | null>('get_config', [id, 'selfavatar']),
        rpc.call<string | null>('get_config', [id, 'private_tag']),
      ]);
      displayName = name ?? '';
      signature = sig ?? '';
      avatarPath = avatar ?? null;
      privateTag = tag ?? '';
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
      // Empty input clears the tag (dc-core treats `null` as "unset").
      const tagTrimmed = privateTag.trim();
      await rpc.call('set_config', [
        id,
        'private_tag',
        tagTrimmed.length === 0 ? null : tagTrimmed,
      ]);
      await refreshProfiles(accounts.configuredIds);
      savedAt = Date.now();
    } finally {
      saving = false;
    }
  }

  function onAvatarPicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    // Hand the file to the cropper; the actual upload happens on confirm.
    // Object URL is revoked in the cropper's onClose/onConfirm path below.
    cropSrc = URL.createObjectURL(file);
  }

  async function onAvatarCropped(blob: Blob) {
    const src = cropSrc;
    cropSrc = null;
    if (src) URL.revokeObjectURL(src);
    if (accounts.selectedId == null) return;
    avatarBusy = true;
    try {
      const path = await uploadBlob(blob, 'png');
      await rpc.call('set_config', [accounts.selectedId, 'selfavatar', path]);
      avatarPath = path;
      await refreshProfiles(accounts.configuredIds);
    } catch (err) {
      errorMsg = `${t('Could not set avatar')}: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      avatarBusy = false;
    }
  }

  function onCropCancel() {
    const src = cropSrc;
    cropSrc = null;
    if (src) URL.revokeObjectURL(src);
  }

  async function doRemoveAvatar() {
    if (accounts.selectedId == null || !avatarPath) return;
    avatarBusy = true;
    try {
      // Empty string clears the avatar in deltachat-core.
      await rpc.call('set_config', [accounts.selectedId, 'selfavatar', '']);
      avatarPath = null;
      await refreshProfiles(accounts.configuredIds);
    } catch (err) {
      errorMsg = `${t('Could not remove avatar')}: ${err instanceof Error ? err.message : String(err)}`;
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
  <SettingsSection title={t('Public profile')}>
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
        <Button variant="accent-text" size="sm" onclick={() => fileInput?.click()} disabled={avatarBusy}>
          {avatarPath ? t('Change photo') : t('Upload photo')}
        </Button>
        {#if avatarPath}
          <Button variant="danger-text" size="sm" onclick={() => (removeAvatarOpen = true)} disabled={avatarBusy}>
            {t('Remove photo')}
          </Button>
        {/if}
      </div>
      <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        hidden
        onchange={onAvatarPicked}
        data-testid="settings-profile__avatar-input"
      />
    </div>

    <div class="field">
      <TextInput
        label={t('Display name')}
        bind:value={displayName}
        placeholder={t('Your name')}
        data-testid="settings-profile__name"
      />
    </div>

    <div class="field">
      <TextInput
        label={t('Signature')}
        bind:value={signature}
        multiline
        rows={3}
        placeholder={t('Shown in your contact info')}
        data-testid="settings-profile__signature"
      />
    </div>

    <div class="field">
      <TextInput
        label={t('Private tag')}
        bind:value={privateTag}
        placeholder={t('e.g. Work, Personal')}
        data-testid="settings-profile__tag"
      />
      <p class="hint">{t('Local label to tell similar profiles apart. Not shared with peers.')}</p>
    </div>

    <div class="actions">
      <Button variant="primary" onclick={save} disabled={saving} data-testid="settings-profile__save">
        {saving ? t('Saving…') : recentlySaved ? t('Saved') : t('Save')}
      </Button>
    </div>
  </SettingsSection>
{/if}

<ConfirmDialog
  open={removeAvatarOpen}
  title={t('Remove profile picture?')}
  confirmLabel={t('Remove photo')}
  danger
  onConfirm={() => void doRemoveAvatar()}
  onClose={() => (removeAvatarOpen = false)}
/>

<ConfirmDialog
  open={errorMsg != null}
  mode="alert"
  title={errorMsg ?? ''}
  onClose={() => (errorMsg = null)}
/>

<ImageCropperDialog
  open={cropSrc != null}
  src={cropSrc}
  onConfirm={(blob) => void onAvatarCropped(blob)}
  onClose={onCropCancel}
/>

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
  .avatar-btn:hover:not(:disabled) {
    filter: brightness(0.95);
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
  .field {
    display: block;
    margin-bottom: var(--space-4);
  }
  .hint {
    margin: var(--space-1) 0 0;
    color: var(--color-fg-tertiary);
    font-size: var(--text-xs);
  }
  .actions {
    margin-top: var(--space-4);
    display: flex;
    justify-content: flex-end;
  }
</style>
