<script lang="ts">
  // Scan a sign-up / login / invite code during onboarding. dispatches on
  // the URI scheme client-side because dc-core's `check_qr` is per-account
  // and we don't have one yet:
  //
  //   - `dcaccount:<host>[?…]`   → custom-relay signup. Routes back to
  //                                 the Instant form with the relay
  //                                 prefilled; the user can still set
  //                                 their displayname + avatar there.
  //   - `dclogin:<…>`             → not yet wired (T018 / ONB-007 is the
  //                                 dedicated task — we surface a guard
  //                                 message that points the user to
  //                                 Manual Setup for now).
  //   - anything else            → "Not a sign-up code".
  //
  // The actual scanner + paste-from-clipboard + camera-permission error
  // surface is the shared `lib/QrScanArea.svelte` primitive.

  import QrScanArea from '../lib/QrScanArea.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onBack: () => void;
    /** Caller routes to Instant with the scanned `dcaccount:` URL passed
     *  as the `qr` prop. Instant threads it into `createInstantAccount`. */
    onDcAccount: (qr: string) => void;
    /** Pre-supplied QR (deep link arriving at the welcome screen). */
    initialCode?: string | null;
  };

  let { onBack, onDcAccount, initialCode = null }: Props = $props();

  let errorMsg = $state<string | null>(null);
  // Re-arm key — bumped after a bad code so the user can scan another.
  let scannerKey = $state(0);

  function dispatch(raw: string) {
    const code = raw.trim();
    if (!code) return;
    const lower = code.toLowerCase();
    if (lower.startsWith('dcaccount:')) {
      errorMsg = null;
      onDcAccount(code);
      return;
    }
    if (lower.startsWith('dclogin:')) {
      // T018 / ONB-007 isn't wired yet — guide the user to manual login
      // instead of silently swallowing the scan.
      errorMsg = t('That looks like a `dclogin:` code. Use Manual Setup to log in with email credentials.');
      scannerKey += 1;
      return;
    }
    errorMsg = t('That is not a sign-up code.');
    scannerKey += 1;
  }

  // Process a deep-link supplied at mount.
  $effect(() => {
    if (initialCode) dispatch(initialCode);
  });
</script>

<header class="topbar" data-tauri-drag-region>
  <BackButton label={t('Back')} onclick={onBack} />
  <h1>{t('Scan Sign-Up Code')}</h1>
</header>

<main class="page" data-testid="onboarding-signup-scan">
  {#if errorMsg}
    <p class="error" data-testid="onboarding-signup-scan__error">{errorMsg}</p>
  {/if}
  {#key scannerKey}
    <QrScanArea
      onScanned={dispatch}
      hint={t('Scan a `dcaccount:` invite to sign up on a different chatmail server.')}
      pasteTestid="onboarding-signup-scan__paste-clipboard"
    />
  {/key}
</main>

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
  .error {
    color: var(--color-danger);
    text-align: center;
    margin: 0;
  }
</style>
