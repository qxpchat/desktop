<script lang="ts" module>
  import type { Snippet } from 'svelte';
  export type Props = {
    onScanned: (code: string) => void;
    /** Toggle the per-frame detector loop while keeping the camera live.
     *  Caller flips this off while a downstream confirm flow is in front
     *  of the scanner, then back on to re-arm. */
    scanning?: boolean;
    /** Optional hint text or snippet rendered above the camera view. */
    hint?: Snippet | string;
    pasteTestid?: string;
    rootTestid?: string;
  };
</script>

<script lang="ts">
  // Shared "scan a QR or paste a code" panel. Pulls together Scanner,
  // clipboard paste, and the error display the onboarding/backup-pair
  // screen used to inline. Two consumers today: `BackupReceive.svelte`
  // (pair as second device) and `SignupScan.svelte` (custom-relay /
  // invite scan during signup).

  import Scanner from '../qr/Scanner.svelte';
  import Button from './Button.svelte';
  import { t } from './i18n/i18n.svelte';

  let { onScanned, scanning = true, hint, pasteTestid, rootTestid }: Props = $props();

  let scanError = $state<string | null>(null);

  async function pasteFromClipboard() {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      scanError = t('Could not read the clipboard.');
      return;
    }
    const code = text.trim();
    if (code) onScanned(code);
  }
</script>

<div class="scan-area" data-testid={rootTestid}>
  {#if hint}
    {#if typeof hint === 'string'}
      <p class="hint">{hint}</p>
    {:else}
      {@render hint()}
    {/if}
  {/if}

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

  <Button variant="accent-text" onclick={pasteFromClipboard} data-testid={pasteTestid}>
    {t('Paste from clipboard')}
  </Button>
</div>

<style>
  .scan-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
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
