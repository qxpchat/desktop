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

<p class="lede">{t('qxp — desktop client for the Delta Chat protocol.')}</p>

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
  .lede {
    margin: 0 0 var(--space-5);
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
