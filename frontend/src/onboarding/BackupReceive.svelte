<script lang="ts">
  import { receiveBackup, onboarding } from '../lib/state/onboarding.svelte';
  import ProgressOverlay from './ProgressOverlay.svelte';
  import Scanner from '../qr/Scanner.svelte';
  import Button from '../lib/Button.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onBack: () => void;
  };

  let { onBack }: Props = $props();

  let scanError = $state<string | null>(null);

  // The scanner runs only while onboarding is idle: starting a flow puts a
  // ProgressOverlay over the screen, and a failed attempt that drops back to
  // idle re-arms the scanner in place (no camera re-init).
  let scanning = $derived(onboarding.phase.kind === 'idle');

  function onScanned(qr: string) {
    // No client-side prefilter — `receiveBackup` runs the code through the
    // daemon's `check_qr`, which is the authoritative validator.
    scanError = null;
    void receiveBackup(qr).catch(() => {
      /* surfaced via ProgressOverlay */
    });
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
    {t('On your other device, open your chatmail client and choose Settings → Add Second Device. Point your camera at the QR code shown there.')}
  </p>

  <Scanner
    {scanning}
    onResult={onScanned}
    onError={(msg) => {
      scanError = msg;
    }}
  />

  {#if scanError}
    <p class="error">{scanError}</p>
  {/if}

  <Button variant="accent-text" onclick={pasteFromClipboard} data-testid="onboarding-backup-receive__paste-clipboard">
    {t('Paste from clipboard')}
  </Button>
</main>

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
</style>
