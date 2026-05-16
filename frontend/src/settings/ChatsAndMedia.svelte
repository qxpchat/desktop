<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import SettingsSection from '../lib/SettingsSection.svelte';
  import SettingsRow from '../lib/SettingsRow.svelte';
  import Toggle from '../lib/Toggle.svelte';
  import TextInput from '../lib/TextInput.svelte';
  import Select from '../lib/Select.svelte';
  import Button from '../lib/Button.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  // Subset of deltachat config keys this section manages.
  let mdnsEnabled = $state(false);
  let mediaQuality = $state('0'); // 0 = balanced, 1 = high
  let downloadLimit = $state('0'); // bytes; 0 = unlimited
  let deleteDeviceAfter = $state('0'); // seconds
  let deleteServerAfter = $state('0'); // seconds
  let deviceCount = $state<number | null>(null);
  let serverCount = $state<number | null>(null);
  let loaded = $state(false);

  onMount(load);

  async function load() {
    if (accounts.selectedId == null) return;
    const id = accounts.selectedId;
    try {
      const [mdns, mq, dl, dda, dsa] = await Promise.all([
        rpc.call<string | null>('get_config', [id, 'mdns_enabled']),
        rpc.call<string | null>('get_config', [id, 'media_quality']),
        rpc.call<string | null>('get_config', [id, 'download_limit']),
        rpc.call<string | null>('get_config', [id, 'delete_device_after']),
        rpc.call<string | null>('get_config', [id, 'delete_server_after']),
      ]);
      mdnsEnabled = mdns === '1';
      mediaQuality = mq ?? '0';
      downloadLimit = dl ?? '0';
      deleteDeviceAfter = dda ?? '0';
      deleteServerAfter = dsa ?? '0';
    } finally {
      loaded = true;
    }
  }

  async function setMdns(value: boolean) {
    if (accounts.selectedId == null) return;
    mdnsEnabled = value;
    await rpc.call('set_config', [accounts.selectedId, 'mdns_enabled', value ? '1' : '0']);
  }

  async function setKey(key: string, value: string) {
    if (accounts.selectedId == null) return;
    await rpc.call('set_config', [accounts.selectedId, key, value]);
  }

  async function previewDeleteDevice() {
    if (accounts.selectedId == null) return;
    deviceCount = await rpc
      .call<number>('estimate_auto_deletion_count', [
        accounts.selectedId,
        false,
        Number(deleteDeviceAfter),
      ])
      .catch(() => 0);
  }
  async function previewDeleteServer() {
    if (accounts.selectedId == null) return;
    serverCount = await rpc
      .call<number>('estimate_auto_deletion_count', [
        accounts.selectedId,
        true,
        Number(deleteServerAfter),
      ])
      .catch(() => 0);
  }
</script>

<h2>{t('Chats & Media')}</h2>

{#if !loaded}
  <p class="muted">{t('Loading…')}</p>
{:else}
  <SettingsSection title={t('Messaging')}>
    <SettingsRow label={t('Send read receipts')} right={mdnsToggle} />
  </SettingsSection>

  {#snippet mdnsToggle()}
    <span data-testid="settings-chats__mdns" data-checked={mdnsEnabled}>
      <Toggle checked={mdnsEnabled} onChange={(v) => void setMdns(v)} label={t('Send read receipts')} />
    </span>
  {/snippet}

  <SettingsSection title={t('Media')}>
    <SettingsRow label={t('Media quality')} right={mediaQualitySelect} />
    <SettingsRow
      label={t('Auto-download size limit')}
      description={t('Bytes; 0 = unlimited.')}
      right={downloadLimitInput}
    />
  </SettingsSection>

  {#snippet mediaQualitySelect()}
    <Select
      bind:value={mediaQuality}
      options={[
        { value: '0', label: t('Balanced') },
        { value: '1', label: t('High') },
      ]}
      onchange={() => void setKey('media_quality', mediaQuality)}
    />
  {/snippet}

  {#snippet downloadLimitInput()}
    <TextInput
      class="cm-number"
      type="number"
      min="0"
      align="right"
      bind:value={downloadLimit}
      onchange={() => void setKey('download_limit', downloadLimit)}
    />
  {/snippet}

  <SettingsSection title={t('Auto-delete')}>
    <SettingsRow
      label={t('From device after')}
      description={deviceCount != null
        ? t('Seconds; 0 = never. Would affect {count} messages.', { count: deviceCount })
        : t('Seconds; 0 = never.')}
      right={deviceDeleteRight}
    />
    <SettingsRow
      label={t('From server after')}
      description={serverCount != null
        ? t('Seconds; 0 = never. Would affect {count} messages.', { count: serverCount })
        : t('Seconds; 0 = never.')}
      right={serverDeleteRight}
    />
  </SettingsSection>

  {#snippet deviceDeleteRight()}
    <TextInput
      class="cm-number"
      type="number"
      min="0"
      align="right"
      bind:value={deleteDeviceAfter}
      onchange={() => void setKey('delete_device_after', deleteDeviceAfter)}
    />
    <Button variant="secondary" size="sm" onclick={previewDeleteDevice}>{t('Preview')}</Button>
  {/snippet}

  {#snippet serverDeleteRight()}
    <TextInput
      class="cm-number"
      type="number"
      min="0"
      align="right"
      bind:value={deleteServerAfter}
      onchange={() => void setKey('delete_server_after', deleteServerAfter)}
    />
    <Button variant="secondary" size="sm" onclick={previewDeleteServer}>{t('Preview')}</Button>
  {/snippet}
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
  /* Constrain the numeric TextInput in the row's right slot. */
  :global(.cm-number) {
    width: 96px;
  }
</style>
