<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import SettingsSection from '../lib/SettingsSection.svelte';
  import SettingsRow from '../lib/SettingsRow.svelte';
  import { SHORTCUTS, shortcutKeys } from '../lib/shortcuts';
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

  // Promoted to dedicated rows so the most useful values are easy to copy.
  // `appVersion` is a build-time constant (see vite.config.ts); core and
  // SQLite come from the daemon, so they're referenced from within a snippet
  // (reactive closure) so no `void` suppressors needed.
  const appVersion = __APP_VERSION__;
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

<SettingsSection title={t('Keyboard shortcuts')}>
  <table class="shortcuts" data-testid="settings-about__shortcuts">
    <tbody>
      {#each SHORTCUTS as s (s.name)}
        <tr data-shortcut={s.name}>
          <td class="sc-label">{t(s.label)}</td>
          <td class="sc-keys"><kbd>{shortcutKeys(s)}</kbd></td>
        </tr>
      {/each}
    </tbody>
  </table>
</SettingsSection>

<SettingsSection title={t('App')}>
  <SettingsRow label={t('Version')} right={versionRight} />
  <SettingsRow label={t('Delta Chat core')} right={coreRight} />
  <SettingsRow label={t('SQLite')} right={sqliteRight} />
  <SettingsRow label={t('Architecture')} right={archRight} />
</SettingsSection>

{#snippet versionRight()}<span class="value" data-testid="settings-about__app-version">{appVersion}</span>{/snippet}
{#snippet coreRight()}<span class="value" data-testid="settings-about__core-version">{coreVersion}</span>{/snippet}
{#snippet sqliteRight()}<span class="value" data-testid="settings-about__sqlite-version">{sqliteVersion}</span>{/snippet}
{#snippet archRight()}<span class="value" data-testid="settings-about__arch">{arch}</span>{/snippet}

<style>
  h2 {
    margin: 0 0 var(--space-5) 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .prose {
    margin: 0;
    line-height: 1.5;
    color: var(--color-fg-secondary);
  }
  .value {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
  }
  .shortcuts {
    width: 100%;
    border-collapse: collapse;
  }
  .shortcuts td {
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
    font-size: var(--text-sm);
  }
  .sc-label {
    color: var(--color-fg);
  }
  .sc-keys {
    text-align: right;
    white-space: nowrap;
  }
  kbd {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: var(--color-bg-hover);
    color: var(--color-fg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
  }
</style>
