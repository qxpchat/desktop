<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import SettingsSection from '../lib/SettingsSection.svelte';
  import SettingsRow from '../lib/SettingsRow.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type SystemInfo = Record<string, unknown>;
  let info = $state<SystemInfo | null>(null);

  onMount(async () => {
    try {
      info = await rpc.call<SystemInfo>('get_system_info');
    } catch {
      info = null;
    }
  });

  // Promoted to dedicated rows so the most useful values are easy to copy
  // without scrolling through the full JSON dump below. Each is referenced
  // from within a snippet (reactive closure) so no `void` suppressors needed.
  let coreVersion = $derived(String(info?.deltachat_core_version ?? '—'));
  let sqliteVersion = $derived(String(info?.sqlite_version ?? '—'));
  let arch = $derived(String(info?.arch ?? '—'));
</script>

<h2>{t('About')}</h2>

<SettingsSection title={t('qxp')}>
  <p class="prose">
    {t(
      'qxp is an instant messaging app built on the standard email protocol. It is a chatmail client — one of many compatible clients. Messages are end-to-end encrypted and kept only on your devices after delivery.',
    )}
  </p>
</SettingsSection>

<SettingsSection title={t('Chatmail')}>
  <p class="prose">
    {t(
      "Chatmail is a network of email servers that powers real-time messaging in clients like qxp. The servers act only as relays: messages are removed once delivered, and eventually even if they aren't. You can add multiple relays — qxp checks all of them, so you stay reachable even if one goes offline.",
    )}
  </p>
</SettingsSection>

<SettingsSection title={t('Decentralization')}>
  <p class="prose">
    {t(
      'Any chatmail client works with any chatmail relay. You can switch to a different client or relay at any time, without depending on a single company, server, or developer team.',
    )}
  </p>
</SettingsSection>

<SettingsSection title={t('Acknowledgements')}>
  <p class="prose">
    {t(
      'We sincerely thank everyone who develops, maintains, funds and supports the chatmail protocol. Your work and dedication bring freedom of communication to everyone.',
    )}
  </p>
</SettingsSection>

<SettingsSection title={t('System')}>
  <SettingsRow label={t('Delta Chat core')} right={coreRight} />
  <SettingsRow label={t('SQLite')} right={sqliteRight} />
  <SettingsRow label={t('Architecture')} right={archRight} />
</SettingsSection>

{#snippet coreRight()}<span class="value" data-testid="settings-about__core-version">{coreVersion}</span>{/snippet}
{#snippet sqliteRight()}<span class="value" data-testid="settings-about__sqlite-version">{sqliteVersion}</span>{/snippet}
{#snippet archRight()}<span class="value" data-testid="settings-about__arch">{arch}</span>{/snippet}

<SettingsSection title={t('Diagnostics')}>
  {#if info}
    <pre class="dump">{JSON.stringify(info, null, 2)}</pre>
  {:else}
    <p class="muted">{t('Loading system info…')}</p>
  {/if}
</SettingsSection>

<style>
  h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .prose {
    margin: 0;
    line-height: 1.5;
    color: var(--color-fg-secondary);
  }
  .muted {
    color: var(--color-fg-secondary);
  }
  .value {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
  }
  .dump {
    margin: 0;
    padding: var(--space-3);
    background: var(--color-bg-hover);
    border-radius: var(--radius-md);
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-fg-secondary);
    user-select: text;
  }
</style>
