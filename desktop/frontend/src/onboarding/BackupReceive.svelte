<script lang="ts">
  import { receiveBackup } from '../lib/state/onboarding.svelte';
  import ProgressOverlay from './ProgressOverlay.svelte';
  import Scanner from '../qr/Scanner.svelte';

  type Props = {
    onBack: () => void;
  };

  let { onBack }: Props = $props();

  let scannedQr = $state<string | null>(null);
  let scanError = $state<string | null>(null);
  let confirmOpen = $state(false);
  let scannerKey = $state(0); // re-mount to retry after reject

  function onScanned(qr: string) {
    // deltachat-core matches the `DCBACKUP` prefix case-insensitively and
    // bumps the version digit over time (currently DCBACKUP4). Accept any
    // `DCBACKUP*:…` form and let `check_qr` / `get_backup` reject if the
    // version is too new for this core build.
    if (/^DCBACKUP\d*:/i.test(qr)) {
      scannedQr = qr;
      confirmOpen = true;
    } else {
      scanError = 'That QR is not a Delta Chat backup pair code.';
      scannerKey += 1;
    }
  }

  async function confirm() {
    confirmOpen = false;
    if (!scannedQr) return;
    try {
      await receiveBackup(scannedQr);
    } catch {
      /* surfaced via ProgressOverlay */
    }
  }

  function cancelConfirm() {
    confirmOpen = false;
    scannedQr = null;
    scannerKey += 1;
  }

  function pasteCode() {
    const code = prompt('Paste backup pair code (DCBACKUP…):');
    if (code) onScanned(code.trim());
  }
</script>

<header class="topbar">
  <button class="back" onclick={onBack}>‹ Back</button>
  <h1>Pair as Second Device</h1>
</header>

<main class="page">
  <p class="hint">
    On your other device, open Delta Chat and choose <em>Settings → Add Second Device</em>.
    Point your camera at the QR code shown there.
  </p>

  {#key scannerKey}
    <Scanner
      onResult={onScanned}
      onError={(msg) => {
        scanError = msg;
      }}
    />
  {/key}

  {#if scanError}
    <p class="error">{scanError}</p>
  {/if}

  <button class="paste" onclick={pasteCode}>Paste Code Manually</button>
</main>

{#if confirmOpen}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="card">
      <h2>Pair this device?</h2>
      <p>You'll receive your account from the other device.</p>
      <div class="actions">
        <button onclick={cancelConfirm}>Cancel</button>
        <button class="primary" onclick={confirm}>Pair</button>
      </div>
    </div>
  </div>
{/if}

<ProgressOverlay />

<style>
  .topbar {
    height: 48px;
    padding: 0 var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    background: var(--color-bg);
  }
  .back {
    color: var(--color-accent);
    font-size: var(--text-md);
    padding: var(--space-2);
  }
  h1 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .page {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
  }
  .hint {
    color: var(--color-fg-secondary);
    text-align: center;
    margin: 0;
  }
  .error {
    color: var(--color-danger);
    text-align: center;
    margin: 0;
  }
  .paste {
    color: var(--color-accent);
    padding: var(--space-3);
    font-size: var(--text-md);
  }
  .paste:hover {
    background: var(--color-bg-hover);
    border-radius: var(--radius-md);
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    backdrop-filter: blur(4px);
  }
  .card {
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    width: min(420px, calc(100vw - 2 * var(--space-4)));
    box-shadow: 0 16px 48px var(--color-shadow);
  }
  .card h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .card p {
    margin: 0 0 var(--space-4) 0;
    color: var(--color-fg-secondary);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
  .actions button {
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    font-weight: 600;
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .actions button:hover {
    background: var(--color-border);
  }
  .actions .primary {
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .actions .primary:hover {
    filter: brightness(1.05);
  }
</style>
