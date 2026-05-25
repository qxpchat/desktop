<script lang="ts">
  // Scan a sign-up / login / invite code during onboarding. Dispatches on
  // the URI scheme client-side because dc-core's `check_qr` is per-account
  // and we don't have one yet:
  //
  //   - `dcaccount:<host>[?…]`     → custom-relay signup. Routes back to
  //                                   the Instant form with the relay
  //                                   prefilled; the user can still set
  //                                   their displayname + avatar there.
  //   - `dclogin:<…>`               → existing-email login. Runs
  //                                   `loginFromQr` inline; dc-core
  //                                   parses every config key from the
  //                                   URL and configures against the
  //                                   real server. Progress shows in the
  //                                   shared ProgressOverlay below.
  //   - `openpgp4fpr:…&i=…&s=…`    → invite from another DC user.
  //   - `https://i.delta.chat/#…`  → invite (https form). Both route to
  //                                   Instant with `prefilledInvite` so
  //                                   the user can pick a name first;
  //                                   submit then runs
  //                                   `signupAndSecureJoin` (creates
  //                                   account on default relay + runs
  //                                   secure_join against the invite).
  //   - anything else              → "Not a sign-up code".
  //
  // The actual scanner + paste-from-clipboard + camera-permission error
  // surface is the shared `lib/QrScanArea.svelte` primitive.

  import QrScanArea from '../lib/QrScanArea.svelte';
  import ProgressOverlay from './ProgressOverlay.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import { loginFromQr, onboarding } from '../lib/state/onboarding.svelte';
  import { fromQxpInviteUrl } from '../lib/inviteUrl';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onBack: () => void;
    /** Caller routes to Instant with the scanned `dcaccount:` URL passed
     *  as the `qr` prop. Instant threads it into `createInstantAccount`. */
    onDcAccount: (qr: string) => void;
    /** Caller routes to Instant with an invite QR — user picks a name,
     *  submit triggers `signupAndSecureJoin`. */
    onInvite: (qr: string) => void;
    /** Pre-supplied QR (deep link arriving at the welcome screen). */
    initialCode?: string | null;
  };

  let { onBack, onDcAccount, onInvite, initialCode = null }: Props = $props();

  let errorMsg = $state<string | null>(null);
  // Re-arm key — bumped after a bad code so the user can scan another.
  let scannerKey = $state(0);
  // While `loginFromQr` is in flight the scanner stays unmounted (the
  // ProgressOverlay takes over). When the flow fails we re-arm.
  let scanning = $derived(onboarding.phase.kind === 'idle');

  function isInviteCode(lower: string, raw: string): boolean {
    // Invite codes carry both an `i=` invitenumber and an `s=` authcode.
    // A bare openpgp4fpr fingerprint (no params) is *not* an invite —
    // it's just a contact verify code with no auth grant. Three host
    // forms qxp may see in the wild: the OPENPGP4FPR URI, the upstream
    // `i.delta.chat` URL (legacy QRs scanned in the wild), and qxp's
    // own `qxp.chat/invite` landing URL.
    if (lower.startsWith('openpgp4fpr:')) {
      return /[?&]i=/.test(raw);
    }
    if (
      lower.startsWith('https://i.delta.chat/') ||
      lower.startsWith('https://qxp.chat/invite')
    ) {
      return /[?&#]i=/.test(raw);
    }
    return false;
  }

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
      errorMsg = null;
      void loginFromQr(code).catch(() => {
        // Error already surfaced via `onboarding.phase = failed` →
        // ProgressOverlay. Re-arm the scanner so the user can try
        // another code.
        scannerKey += 1;
      });
      return;
    }
    if (isInviteCode(lower, code)) {
      errorMsg = null;
      // dc-core's `check_qr` (and `secure_join` downstream) doesn't
      // recognise the qxp.chat invite-URL host, so rewrite back to
      // OPENPGP4FPR before forwarding. Non-qxp URLs pass through.
      onInvite(fromQxpInviteUrl(code));
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
      {scanning}
      onScanned={dispatch}
      hint={t('Scan a sign-up code: `dcaccount:` (custom relay), `dclogin:` (existing email), or `openpgp4fpr:` invite.')}
      pasteTestid="onboarding-signup-scan__paste-clipboard"
    />
  {/key}
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
  .error {
    color: var(--color-danger);
    text-align: center;
    margin: 0;
  }
</style>
