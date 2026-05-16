<script lang="ts">
  import { receiveBackup } from '../lib/state/onboarding.svelte';
  import ProgressOverlay from './ProgressOverlay.svelte';
  import Scanner from '../qr/Scanner.svelte';
  import Modal from '../lib/Modal.svelte';
  import Button from '../lib/Button.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

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

  async function pasteFromClipboard() {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      scanError = 'Could not read the clipboard.';
      return;
    }
    const code = text.trim();
    if (code) onScanned(code);
  }
</script>

<header class="topbar" data-tauri-drag-region>
  <BackButton label={t('Back')} onclick={onBack} />
  <h1>{t('Pair as Second Device')}</h1>
</header>

<main class="page" data-testid="onboarding-backup-receive">
  <p class="hint">
    {t('On your other device, open Delta Chat and choose Settings → Add Second Device. Point your camera at the QR code shown there.')}
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

  <Button variant="accent-text" onclick={pasteFromClipboard} data-testid="onboarding-backup-receive__paste-clipboard">
    {t('Paste from clipboard')}
  </Button>
</main>

<Modal open={confirmOpen} onClose={cancelConfirm} size="md">
  <div class="dialog-body">
    <h2>{t('Pair this device?')}</h2>
    <p>{t("You'll receive your account from the other device.")}</p>
    <div class="actions">
      <Button variant="secondary" onclick={cancelConfirm}>{t('Cancel')}</Button>
      <Button variant="primary" onclick={confirm} data-testid="onboarding-backup-receive__confirm">{t('Pair')}</Button>
    </div>
  </div>
</Modal>

<ProgressOverlay />

<style>
  .topbar {
    padding: calc(var(--titlebar-gutter)) var(--space-3) 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 48px;
    background: var(--color-bg);
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
  .dialog-body {
    padding: var(--space-5);
  }
  .dialog-body h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .dialog-body p {
    margin: 0 0 var(--space-4) 0;
    color: var(--color-fg-secondary);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
