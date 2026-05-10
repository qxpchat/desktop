<script lang="ts">
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { onEvent } from '../lib/events';
  import { fileUrl } from '../lib/files';
  import { setMainRoute } from '../lib/state/mainRoute.svelte';

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
      message = 'Backup failed.';
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

<h2>Backup</h2>

<div class="card">
  <h3>Export backup</h3>
  <p class="muted">Save your account as a <code>.tar</code> file you can restore on another device.</p>
  {#if status === 'idle'}
    <button class="primary" onclick={startExport}>Export backup</button>
  {:else if status === 'exporting'}
    <progress max="1000" value={progress}></progress>
    <p class="muted">{Math.round((progress / 1000) * 100)}%</p>
  {:else if status === 'ready' && writtenPath}
    <a class="primary" href={fileUrl(writtenPath)} download>Download backup</a>
    <p class="muted small">Saved to {writtenPath}</p>
  {:else if status === 'error'}
    <p class="error">{message ?? 'Export failed'}</p>
    <button onclick={() => (status = 'idle')}>Try again</button>
  {/if}
</div>

<div class="card">
  <h3>Pair another device</h3>
  <p class="muted">Show a QR on this device that another Delta Chat client can scan to receive a copy of your account.</p>
  <button onclick={pairAsSecondDevice}>Show pair QR</button>
</div>

<style>
  h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-xl);
  }
  h3 {
    margin: 0 0 6px 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .card {
    max-width: 520px;
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    background: var(--color-bg-elevated);
  }
  .muted {
    color: var(--color-fg-secondary);
    margin: 0 0 12px 0;
  }
  .small {
    font-size: var(--text-xs);
    word-break: break-all;
  }
  .primary {
    display: inline-block;
    padding: 8px 16px;
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
    text-decoration: none;
  }
  .primary:hover {
    filter: brightness(1.05);
  }
  progress {
    width: 100%;
    height: 8px;
    accent-color: var(--color-accent);
  }
  .error {
    color: var(--color-danger);
  }
</style>
