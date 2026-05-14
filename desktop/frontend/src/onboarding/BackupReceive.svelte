<script lang="ts">
  import { receiveBackup } from '../lib/state/onboarding.svelte';
  import ProgressOverlay from './ProgressOverlay.svelte';
  import Scanner from '../qr/Scanner.svelte';
  import Modal from '../lib/Modal.svelte';
  import Button from '../lib/Button.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onBack: () => void;
  };

  let { onBack }: Props = $props();

  let scannedQr = $state<string | null>(null);
  let scanError = $state<string | null>(null);
  let confirmOpen = $state(false);
  let scannerKey = $state(0); // re-mount to retry after reject
  let pasteOpen = $state(false);
  let pasteValue = $state('');

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

  function openPaste() {
    pasteValue = '';
    pasteOpen = true;
  }

  function cancelPaste() {
    pasteOpen = false;
    pasteValue = '';
  }

  function submitPaste() {
    const code = pasteValue.trim();
    pasteOpen = false;
    pasteValue = '';
    if (code) onScanned(code);
  }
</script>

<header class="topbar" data-tauri-drag-region>
  <button class="back" onclick={onBack}>‹ {t('Back')}</button>
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

  <button class="paste" onclick={openPaste} data-testid="onboarding-backup-receive__paste-open">{t('Paste Code Manually')}</button>
</main>

<Modal open={pasteOpen} onClose={cancelPaste} size="md">
  <div class="dialog-body">
    <h2>{t('Paste backup pair code')}</h2>
    <p>{t('Paste the DCBACKUP… code shown on the other device.')}</p>
    <!-- svelte-ignore a11y_autofocus -->
    <textarea
      bind:value={pasteValue}
      placeholder="DCBACKUP4:…"
      autofocus
      rows="3"
      spellcheck="false"
      autocapitalize="off"
      data-testid="onboarding-backup-receive__paste-input"
    ></textarea>
    <div class="actions">
      <Button variant="secondary" onclick={cancelPaste}>{t('Cancel')}</Button>
      <Button variant="primary" onclick={submitPaste} disabled={!pasteValue.trim()} data-testid="onboarding-backup-receive__paste-submit">{t('Pair')}</Button>
    </div>
  </div>
</Modal>

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
  .dialog-body textarea {
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 var(--space-4) 0;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    resize: vertical;
    min-height: 72px;
  }
  .dialog-body textarea:focus {
    outline: none;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
