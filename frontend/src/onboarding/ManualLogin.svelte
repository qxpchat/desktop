<script lang="ts">
  import { onboarding, loginManually } from '../lib/state/onboarding.svelte';
  import { rpc } from '../lib/rpc';
  import ProgressOverlay from './ProgressOverlay.svelte';
  import Button from '../lib/Button.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import TextInput from '../lib/TextInput.svelte';
  import Select from '../lib/Select.svelte';
  import Icon from '../lib/Icon.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onBack: () => void;
  };

  let { onBack }: Props = $props();

  let addr = $state('');
  let mailPw = $state('');
  let advancedOpen = $state(false);

  // dc-core's offline provider DB. Status values follow the
  // `DC_PROVIDER_STATUS_*` enum: 1 = OK, 2 = PREPARATION (extra steps
  // needed e.g. enable IMAP / app password), 3 = BROKEN (login won't
  // work as-is). The JSON-RPC binding takes an `account_id` arg but
  // ignores it (`_account_id` in the impl) — pass 0 so we can look up a
  // domain before any account exists.
  type ProviderInfo = {
    beforeLoginHint: string;
    overviewPage: string;
    status: number;
  };
  let providerInfo = $state<ProviderInfo | null>(null);

  $effect(() => {
    const email = addr.trim();
    if (!email.includes('@')) {
      providerInfo = null;
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const info = await rpc.call<ProviderInfo | null>('get_provider_info', [0, email]);
        providerInfo = info ?? null;
      } catch {
        providerInfo = null;
      }
    }, 500);
    return () => clearTimeout(handle);
  });

  // Advanced overrides — passed as deltachat config keys when non-empty.
  let mail_server = $state('');
  let mail_port = $state('');
  let mail_security = $state('');
  let send_server = $state('');
  let send_port = $state('');
  let send_security = $state('');
  // Distinct SMTP creds. When blank, dc-core falls back to `addr` +
  // `mail_pw` for SMTP auth (the common case). Set these when the
  // outgoing server uses a different login than the incoming one — e.g.
  // some self-hosted setups with separate IMAP / SMTP accounts.
  let send_user = $state('');
  let send_pw = $state('');
  let imap_certificate_checks = $state('');

  let canLogin = $derived(
    addr.trim().length > 0 && mailPw.length > 0 && onboarding.phase.kind === 'idle',
  );

  async function login() {
    const advanced: Record<string, string> = {};
    if (mail_server) advanced.mail_server = mail_server;
    if (mail_port) advanced.mail_port = mail_port;
    if (mail_security) advanced.mail_security = mail_security;
    if (send_server) advanced.send_server = send_server;
    if (send_port) advanced.send_port = send_port;
    if (send_security) advanced.send_security = send_security;
    if (send_user) advanced.send_user = send_user;
    if (send_pw) advanced.send_pw = send_pw;
    if (imap_certificate_checks) advanced.imap_certificate_checks = imap_certificate_checks;

    try {
      await loginManually(addr.trim(), mailPw, advanced);
    } catch {
      /* error surfaced via onboarding.phase */
    }
  }

  const securityOptions = $derived([
    { value: '', label: t('Auto') },
    { value: '1', label: 'SSL/TLS' },
    { value: '2', label: 'STARTTLS' },
    { value: '3', label: t('Plain') },
  ]);
  const certOptions = $derived([
    { value: '', label: t('Auto') },
    { value: '1', label: t('Strict') },
    { value: '3', label: t('Accept invalid') },
  ]);
</script>

<header class="topbar" data-tauri-drag-region>
  <BackButton label={t('Back')} onclick={onBack} />
  <h1>{t('Manual Setup')}</h1>
</header>

<main class="manual" data-testid="onboarding-manual">
  <TextInput
    label={t('Email')}
    type="email"
    bind:value={addr}
    autocomplete="email"
    placeholder="you@example.com"
    autocapitalize="off"
    spellcheck="false"
    data-testid="onboarding-manual__addr"
  />

  <TextInput
    label={t('Password')}
    type="password"
    bind:value={mailPw}
    autocomplete="current-password"
    data-testid="onboarding-manual__password"
  />

  {#if providerInfo && providerInfo.beforeLoginHint}
    <!-- `status=3` means dc-core's offline DB knows the provider cannot
         be configured the normal way (e.g. closed, IMAP disabled). Show
         it red; anything lower is a "heads up". -->
    <div
      class="provider-hint"
      class:broken={providerInfo.status === 3}
      data-testid="onboarding-manual__provider-hint"
      data-provider-status={providerInfo.status}
    >
      <p>{providerInfo.beforeLoginHint}</p>
      {#if providerInfo.overviewPage}
        <a href={providerInfo.overviewPage} target="_blank" rel="noopener noreferrer">
          {t('More info')}
        </a>
      {/if}
    </div>
  {/if}

  <Button class="advanced-toggle" variant="accent-text" size="sm" onclick={() => (advancedOpen = !advancedOpen)} data-testid="onboarding-manual__advanced-toggle">
    <Icon name={advancedOpen ? 'chevron-down' : 'chevron-right'} size={14} />
    {t('Advanced')}
  </Button>

  {#if advancedOpen}
    <fieldset>
      <legend>{t('IMAP (incoming)')}</legend>
      <TextInput label={t('Server')} bind:value={mail_server} placeholder="imap.example.com" autocapitalize="off" spellcheck="false" />
      <TextInput label={t('Port')} type="number" bind:value={mail_port} placeholder="993" />
      <Select label={t('Security')} bind:value={mail_security} options={securityOptions} />
      <Select label={t('Cert check')} bind:value={imap_certificate_checks} options={certOptions} />
    </fieldset>

    <fieldset>
      <legend>{t('SMTP (outgoing)')}</legend>
      <TextInput label={t('Server')} bind:value={send_server} placeholder="smtp.example.com" autocapitalize="off" spellcheck="false" />
      <TextInput label={t('Port')} type="number" bind:value={send_port} placeholder="465" />
      <Select label={t('Security')} bind:value={send_security} options={securityOptions} />
      <!-- Separate SMTP user / password — leave blank to reuse the main
           email + password for outgoing auth (default behaviour). Set
           them when the outgoing server uses a different login than the
           incoming one. -->
      <TextInput
        label={t('SMTP login')}
        bind:value={send_user}
        autocomplete="username"
        autocapitalize="off"
        spellcheck="false"
        placeholder={t('Defaults to email')}
        data-testid="onboarding-manual__smtp-user"
      />
      <TextInput
        label={t('SMTP password')}
        type="password"
        bind:value={send_pw}
        autocomplete="new-password"
        placeholder={t('Defaults to email password')}
        data-testid="onboarding-manual__smtp-password"
      />
    </fieldset>
  {/if}

  <div class="submit-row">
    <Button variant="primary" size="lg" block disabled={!canLogin} onclick={login} data-testid="onboarding-manual__submit">{t('Log In')}</Button>
  </div>
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
  .manual {
    max-width: 420px;
    margin: 0 auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .manual :global(.advanced-toggle) {
    align-self: flex-start;
    padding-inline: var(--space-1);
  }
  fieldset {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  legend {
    padding: 0 var(--space-2);
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .submit-row {
    margin-top: var(--space-3);
  }
  .provider-hint {
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    font-size: var(--text-sm);
    color: var(--color-fg);
  }
  .provider-hint.broken {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }
  .provider-hint p {
    margin: 0 0 var(--space-2);
  }
  .provider-hint a {
    color: var(--color-accent);
    text-decoration: none;
    font-weight: 500;
  }
  .provider-hint a:hover {
    text-decoration: underline;
  }
</style>
