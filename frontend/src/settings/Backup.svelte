<script lang="ts">
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { onEvent } from '../lib/events';
  import { fileUrl } from '../lib/files';
  import { setMainRoute } from '../lib/state/mainRoute.svelte';
  import SettingsSection from '../lib/SettingsSection.svelte';
  import SettingsRow from '../lib/SettingsRow.svelte';
  import Button from '../lib/Button.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  let status = $state<'idle' | 'exporting' | 'ready' | 'error'>('idle');
  let progress = $state(0);
  let message = $state<string | null>(null);
  let writtenPath = $state<string | null>(null);

  onEvent('ImexProgress', (ev) => {
    if (status !== 'exporting') return;
    if (ev.contextId !== accounts.selectedId) return;
    const p = Number(ev.event.progress);
    if (p === 0) {
      status = 'error';
      message = t('Backup failed.');
    } else if (p === 1000) {
      status = 'ready';
      progress = 1000;
    } else {
      progress = p;
    }
  });

  onEvent('ImexFileWritten', (ev) => {
    if (ev.contextId !== accounts.selectedId) return;
    writtenPath = (ev.event.path as string | null) ?? null;
  });

  async function startExport() {
    if (accounts.selectedId == null) return;
    status = 'exporting';
    progress = 0;
    message = null;
    writtenPath = null;
    // The backup file is created inside the daemon's accounts dir under
    // `_uploads/` so the GET /file endpoint can serve it back to the browser
    // (it validates that the path is under accounts_dir).
    const dest = `./qxp-web-accounts/_uploads`;
    try {
      await rpc.call('export_backup', [accounts.selectedId, dest, null]);
    } catch (err) {
      status = 'error';
      message = err instanceof Error ? err.message : String(err);
    }
  }

  function pairAsSecondDevice() {
    setMainRoute({ kind: 'qrShow' });
  }
</script>

<h2>{t('Backup')}</h2>

<SettingsSection
  title={t('Export backup')}
  footer={t('Save your account as a .tar file you can restore on another device.')}
>
  <div data-testid="settings-backup__status" data-status={status}>
    {#if status === 'idle'}
      <span data-testid="settings-backup__export">
        <SettingsRow label={t('Export backup')} icon="hard-drive" onClick={startExport} />
      </span>
    {:else if status === 'exporting'}
      <div class="progress-row">
        <span class="label">{t('Exporting…')}</span>
        <progress max="1000" value={progress}></progress>
        <span class="pct">{Math.round((progress / 1000) * 100)}%</span>
      </div>
    {:else if status === 'ready' && writtenPath}
      <a class="row link" href={fileUrl(writtenPath)} download data-testid="settings-backup__download">
        <span class="label">{t('Download backup')}</span>
        <span class="value">{t('Saved to {path}', { path: writtenPath })}</span>
      </a>
    {:else if status === 'error'}
      <div class="row">
        <span class="label danger">{message ?? t('Export failed')}</span>
        <Button variant="secondary" size="sm" onclick={() => (status = 'idle')}>{t('Try again')}</Button>
      </div>
    {/if}
  </div>
</SettingsSection>

<SettingsSection
  title={t('Pair another device')}
  footer={t('Show a QR on this device that another Delta Chat client can scan to receive a copy of your account.')}
>
  <SettingsRow label={t('Show pair QR')} icon="qr-code" onClick={pairAsSecondDevice} />
</SettingsSection>

<style>
  h2 {
    margin: 0 0 var(--space-5) 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .progress-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 12px 0;
  }
  .progress-row .label {
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .progress-row .pct {
    color: var(--color-fg-tertiary);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    min-width: 40px;
    text-align: right;
  }
  progress {
    flex: 1;
    height: 6px;
    accent-color: var(--color-accent);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 10px 0;
  }
  .row .label {
    flex: 1;
    min-width: 0;
    font-size: var(--text-md);
  }
  .row.link {
    color: inherit;
    text-decoration: none;
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: background 0.1s ease;
    padding: 10px var(--space-3);
    margin: 0 calc(-1 * var(--space-3));
  }
  .row.link:hover {
    background: var(--color-bg-hover);
  }
  .row .value {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 240px;
  }
  .label.danger {
    color: var(--color-danger);
  }
</style>
