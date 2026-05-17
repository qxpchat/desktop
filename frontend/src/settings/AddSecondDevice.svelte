<script lang="ts">
  import { onDestroy } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { onEvent } from '../lib/events';
  import SettingsSection from '../lib/SettingsSection.svelte';
  import Button from '../lib/Button.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  // Multi-device / send-backup flow. `provide_backup` starts a local-network
  // backup provider and blocks until a second device pulls the account (or
  // `stop_ongoing_process` cancels it); it also owns stop/restart of the
  // account's IO. `get_backup_qr` returns the DCBACKUP pair code the other
  // device scans, `create_qr_svg` renders it. The receiving half lives in
  // onboarding (BackupReceive.svelte → `get_backup`).
  type Stage = 'idle' | 'preparing' | 'awaiting' | 'transferring' | 'done' | 'error';

  let stage = $state<Stage>('idle');
  let svg = $state<string | null>(null);
  let qrText = $state<string | null>(null);
  let progress = $state(0);
  let message = $state<string | null>(null);
  let copied = $state(false);

  // Account the in-flight provider belongs to. Guards the ImexProgress
  // handler and `stop_ongoing_process` against a mid-flow account switch.
  let activeId: number | null = null;
  let canceled = false;

  onEvent('ImexProgress', (ev) => {
    if (ev.contextId !== activeId) return;
    const p = Number(ev.event.progress);
    if (p === 0) {
      // 0 = abort. Core also emits it on `stop_ongoing_process`, so a
      // user-driven cancel is not an error.
      if (!canceled) fail(t('Device transfer failed.'));
    } else {
      progress = p;
      if (stage === 'awaiting') stage = 'transferring';
    }
  });

  function fail(msg: string) {
    if (stage === 'error') return;
    stage = 'error';
    message = msg;
  }

  // Re-reads `stage` widened to the full union. TypeScript narrows the rune
  // through the assignments in `start()` and can't see that `fail()` or the
  // ImexProgress handler may have flipped it to 'error' across an `await`.
  function currentStage(): Stage {
    return stage;
  }

  function reset() {
    stage = 'idle';
    svg = null;
    qrText = null;
    message = null;
    progress = 0;
  }

  async function stopProvider() {
    if (activeId == null) return;
    try {
      await rpc.call('stop_ongoing_process', [activeId]);
    } catch {
      /* core may have already finished — ignore */
    }
  }

  async function start() {
    const id = accounts.selectedId;
    if (id == null) return;
    activeId = id;
    canceled = false;
    stage = 'preparing';
    message = null;
    progress = 0;

    // `provide_backup` resolves only once the transfer completes or is
    // canceled. Kick it off without awaiting, fetch the QR, then await it.
    const transfer = rpc.call('provide_backup', [id]);

    try {
      qrText = await rpc.call<string>('get_backup_qr', [id]);
      svg = await rpc.call<string>('create_qr_svg', [qrText]);
      stage = 'awaiting';
    } catch (err) {
      if (!canceled) fail(err instanceof Error ? err.message : String(err));
      // QR fetch failed — tear the provider down so the dangling
      // `provide_backup` call below resolves instead of leaking.
      await stopProvider();
    }

    try {
      await transfer;
    } catch (err) {
      // `provide_backup` rejects when canceled — expected, not an error.
      if (!canceled) fail(err instanceof Error ? err.message : String(err));
    }

    svg = null;
    qrText = null;
    activeId = null;
    if (currentStage() === 'error') return;
    if (canceled) reset();
    else stage = 'done';
  }

  async function cancel() {
    canceled = true;
    await stopProvider();
  }

  async function copyCode() {
    if (!qrText) return;
    try {
      await navigator.clipboard.writeText(qrText);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard denied */
    }
  }

  // Leaving the section mid-transfer must tear the provider down, otherwise
  // the account's IO stays stopped.
  onDestroy(() => {
    if (stage === 'preparing' || stage === 'awaiting' || stage === 'transferring') {
      void cancel();
    }
  });
</script>

<h2>{t('Add Second Device')}</h2>

<div data-testid="settings-add-device" data-stage={stage}>
  {#if stage === 'idle' || stage === 'done'}
    <SettingsSection
      title={t('Pair another device')}
      footer={t('This device keeps a copy. The new device receives the same account and stays in sync over email.')}
    >
      {#if stage === 'done'}
        <p class="ok" data-testid="settings-add-device__done">{t('The other device received your account.')}</p>
      {/if}
      <ol class="steps">
        <li>{t('Install a chatmail client on the other device.')}</li>
        <li>{t('Keep both devices on the same Wi-Fi network.')}</li>
        <li>{t('On the other device choose “Add as Second Device” and scan the QR.')}</li>
      </ol>
      <Button variant="primary" onclick={start} data-testid="settings-add-device__start">
        {t('Start pairing')}
      </Button>
    </SettingsSection>
  {:else if stage === 'preparing'}
    <p class="hint" data-testid="settings-add-device__preparing">{t('Preparing account…')}</p>
  {:else if stage === 'awaiting' && svg}
    <div class="card">
      <!-- daemon-trusted SVG; safe to render -->
      <div class="svg-wrap" data-testid="settings-add-device__qr">{@html svg}</div>
      <p class="caption">{t('Scan this on the other device, or copy the code below.')}</p>
      {#if qrText}
        <p class="code" data-testid="settings-add-device__code" title={qrText}>{qrText}</p>
      {/if}
      <div class="actions">
        <Button variant="secondary" size="sm" onclick={copyCode} data-testid="settings-add-device__copy">
          {copied ? t('Copied!') : t('Copy code')}
        </Button>
        <Button variant="danger-text" size="sm" onclick={cancel} data-testid="settings-add-device__cancel">
          {t('Cancel')}
        </Button>
      </div>
    </div>
  {:else if stage === 'transferring'}
    <div class="progress-row">
      <span class="label">{t('Transferring…')}</span>
      <progress max="1000" value={progress}></progress>
      <span class="pct">{Math.round((progress / 1000) * 100)}%</span>
    </div>
  {:else if stage === 'error'}
    <p class="error" data-testid="settings-add-device__error">{message ?? t('Device transfer failed.')}</p>
    <Button variant="secondary" size="sm" onclick={reset}>{t('Try again')}</Button>
  {/if}
</div>

<style>
  h2 {
    margin: 0 0 var(--space-5) 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .steps {
    margin: 0 0 var(--space-4) 0;
    padding-left: var(--space-5);
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .card {
    width: min(360px, 100%);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .svg-wrap {
    width: 240px;
    height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .svg-wrap :global(svg) {
    width: 100%;
    height: 100%;
  }
  .caption {
    margin: 0;
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .code {
    margin: 0;
    width: 100%;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    word-break: break-all;
    user-select: all;
    max-height: 4.5em;
    overflow-y: auto;
  }
  .actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    justify-content: center;
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
  .hint {
    color: var(--color-fg-secondary);
  }
  .ok {
    margin: 0 0 var(--space-4) 0;
    color: var(--color-accent);
    font-size: var(--text-sm);
  }
  .error {
    color: var(--color-danger);
    margin: 0 0 var(--space-3) 0;
  }
</style>
