<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { refreshProfiles, profiles } from '../lib/state/profiles.svelte';
  import { uploadBlob } from '../lib/files';
  import AvatarEditor from '../lib/AvatarEditor.svelte';
  import Button from '../lib/Button.svelte';
  import TextInput from '../lib/TextInput.svelte';
  import SettingsSection from '../lib/SettingsSection.svelte';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  let displayName = $state('');
  let signature = $state('');
  let privateTag = $state('');
  let avatarPath = $state<string | null>(null);
  let saving = $state(false);
  let savedAt = $state(0);
  let loaded = $state(false);
  let avatarBusy = $state(false);
  let errorMsg = $state<string | null>(null);

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

  /** AvatarEditor `onChange`: `blob` set = picked + cropped a new image,
   *  `null` = remove. Empty string clears the avatar in dc-core. */
  async function onAvatarChange(blob: Blob | null) {
    if (accounts.selectedId == null) return;
    avatarBusy = true;
    try {
      const path = blob ? await uploadBlob(blob, 'png') : '';
      await rpc.call('set_config', [accounts.selectedId, 'selfavatar', path]);
      avatarPath = path || null;
      await refreshProfiles(accounts.configuredIds);
    } catch (err) {
      const fallback = blob ? t('Could not set avatar') : t('Could not remove avatar');
      errorMsg = `${fallback}: ${err instanceof Error ? err.message : String(err)}`;
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
      <AvatarEditor
        name={displayName}
        color={profiles.list.find((p) => p.id === accounts.selectedId)?.color ?? 'var(--color-accent)'}
        imagePath={avatarPath}
        size={96}
        disabled={avatarBusy}
        onChange={onAvatarChange}
        data-testid="settings-profile__avatar"
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
  open={errorMsg != null}
  mode="alert"
  title={errorMsg ?? ''}
  onClose={() => (errorMsg = null)}
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
