<script lang="ts" module>
  // `EnteredLoginParam` mirrors the JSON-RPC type
  // (`api/types/login_param.rs`). Importing here keeps the Connectivity view
  // import shallow.
  export type LoginParam = {
    addr: string;
    password: string;
    imapServer?: string | null;
    imapPort?: number | null;
    imapSecurity?: string | null;
    imapUser?: string | null;
    smtpServer?: string | null;
    smtpPort?: number | null;
    smtpSecurity?: string | null;
    smtpUser?: string | null;
    smtpPassword?: string | null;
    certificateChecks?: string | null;
    oauth2?: boolean | null;
  };
</script>

<script lang="ts">
  // Ports `ios/qxp/Views/TransportFormView.swift`. Add-mode shows an empty
  // form with focus on Email; edit-mode pre-fills and locks the Email
  // (deltachat-core keys transports by addr — changing it = adding a new
  // one). Advanced IMAP/SMTP/cert fields are hidden behind a disclosure;
  // leave them blank to let the core auto-discover.
  import Icon from '../lib/Icon.svelte';
  import IconButton from '../lib/IconButton.svelte';
  import Modal from '../lib/Modal.svelte';
  import Button from '../lib/Button.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props =
    | { mode: 'add'; existing?: undefined; onSubmit: (p: LoginParam) => void; onCancel: () => void }
    | { mode: 'edit'; existing: LoginParam; onSubmit: (p: LoginParam) => void; onCancel: () => void };

  let { mode, existing, onSubmit, onCancel }: Props = $props();

  const isEdit = $derived(mode === 'edit');
  // `p` only feeds the `$state(...)` initializers below, which run once
  // at mount — capturing the initial value is intentional.
  // svelte-ignore state_referenced_locally
  const p: LoginParam | undefined = existing;

  let email = $state(p?.addr ?? '');
  let password = $state(p?.password ?? '');
  let advancedOpen = $state(false);

  let imapServer = $state(p?.imapServer ?? '');
  let imapPort = $state(p?.imapPort != null ? String(p.imapPort) : '');
  let imapUser = $state(p?.imapUser ?? '');
  let imapSecurity = $state(p?.imapSecurity ?? 'automatic');
  let smtpServer = $state(p?.smtpServer ?? '');
  let smtpPort = $state(p?.smtpPort != null ? String(p.smtpPort) : '');
  let smtpUser = $state(p?.smtpUser ?? '');
  let smtpPassword = $state(p?.smtpPassword ?? '');
  let smtpSecurity = $state(p?.smtpSecurity ?? 'automatic');
  let certificateChecks = $state(p?.certificateChecks ?? 'automatic');

  // Security and cert-check enums must match the JSON tags in
  // `EnteredCertificateChecks` / `Socket` (the Rust types). Same string set
  // as iOS TransportFormView.swift.
  const securityOptions = $derived([
    { value: 'automatic', label: t('Automatic') },
    { value: 'ssl', label: 'SSL/TLS' },
    { value: 'starttls', label: 'StartTLS' },
    { value: 'plain', label: t('Off') },
  ]);

  const certOptions = $derived([
    { value: 'automatic', label: t('Automatic') },
    { value: 'strict', label: t('Strict') },
    { value: 'acceptInvalidCertificates', label: t('Accept Invalid Certificates') },
  ]);

  let canSubmit = $derived(email.trim().length > 0 && password.length > 0);

  function nilIfEmpty(s: string): string | null {
    const t = s.trim();
    return t.length === 0 ? null : t;
  }

  function submit() {
    if (!canSubmit) return;
    const port = (v: string): number | null => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const param: LoginParam = {
      addr: email.trim(),
      password,
      imapServer: nilIfEmpty(imapServer),
      imapPort: port(imapPort),
      imapUser: nilIfEmpty(imapUser),
      imapSecurity,
      smtpServer: nilIfEmpty(smtpServer),
      smtpPort: port(smtpPort),
      smtpUser: nilIfEmpty(smtpUser),
      smtpPassword: nilIfEmpty(smtpPassword),
      smtpSecurity,
      certificateChecks,
    };
    onSubmit(param);
  }
</script>

<Modal open={true} onClose={onCancel} size="lg" ariaLabel={isEdit ? t('Edit Relay') : t('Manual Setup')}>
  <div class="dialog">
    <header class="head">
      <h3>{isEdit ? t('Edit Relay') : t('Manual Setup')}</h3>
      <IconButton variant="subtle" size={28} icon="x" label={t('Cancel')} onclick={onCancel} />
    </header>

    <div class="form">
      <label class="field">
        <span>{t('Email')}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="email"
          bind:value={email}
          disabled={isEdit}
          autofocus={!isEdit}
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
        />
      </label>
      <label class="field">
        <span>{t('Password')}</span>
        <input
          type="password"
          bind:value={password}
          autocomplete="current-password"
          onkeydown={(e) => {
            if (e.key === 'Enter' && canSubmit) submit();
          }}
        />
      </label>

      <button class="disclosure" onclick={() => (advancedOpen = !advancedOpen)} type="button">
        <Icon name={advancedOpen ? 'arrow-down' : 'chevron-right'} size={14} />
        {t('More options')}
      </button>

      {#if advancedOpen}
        <div class="advanced">
          <label class="field">
            <span>{t('IMAP Security')}</span>
            <select bind:value={imapSecurity}>
              {#each securityOptions as o (o.value)}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>{t('IMAP Login')}</span>
            <input bind:value={imapUser} placeholder={t('Automatic')} autocapitalize="off" autocorrect="off" spellcheck="false" />
          </label>
          <label class="field">
            <span>{t('IMAP Server')}</span>
            <input bind:value={imapServer} placeholder={t('Automatic')} autocapitalize="off" autocorrect="off" spellcheck="false" />
          </label>
          <label class="field">
            <span>{t('IMAP Port')}</span>
            <input
              bind:value={imapPort}
              placeholder={t('Automatic')}
              inputmode="numeric"
              pattern="\d*"
            />
          </label>

          <label class="field">
            <span>{t('SMTP Security')}</span>
            <select bind:value={smtpSecurity}>
              {#each securityOptions as o (o.value)}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>{t('SMTP Login')}</span>
            <input bind:value={smtpUser} placeholder={t('Automatic')} autocapitalize="off" autocorrect="off" spellcheck="false" />
          </label>
          <label class="field">
            <span>{t('SMTP Password')}</span>
            <input type="password" bind:value={smtpPassword} placeholder={t('Automatic')} />
          </label>
          <label class="field">
            <span>{t('SMTP Server')}</span>
            <input bind:value={smtpServer} placeholder={t('Automatic')} autocapitalize="off" autocorrect="off" spellcheck="false" />
          </label>
          <label class="field">
            <span>{t('SMTP Port')}</span>
            <input
              bind:value={smtpPort}
              placeholder={t('Automatic')}
              inputmode="numeric"
              pattern="\d*"
            />
          </label>

          <label class="field">
            <span>{t('Certificate Check')}</span>
            <select bind:value={certificateChecks}>
              {#each certOptions as o (o.value)}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
          </label>

          <p class="hint">{t('Leave fields blank to detect automatically.')}</p>
        </div>
      {/if}
    </div>

    <div class="actions">
      <Button variant="secondary" onclick={onCancel}>{t('Cancel')}</Button>
      <Button variant="primary" onclick={submit} disabled={!canSubmit}>
        {isEdit ? t('Save') : t('Add')}
      </Button>
    </div>
  </div>
</Modal>

<style>
  .dialog {
    padding: var(--space-5);
    overflow-y: auto;
    max-height: calc(100vh - 4 * var(--space-5));
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  h3 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field > span {
    font-size: var(--text-xs);
    color: var(--color-fg-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .field input,
  .field select {
    height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    font-size: var(--text-sm);
  }
  .field input:focus,
  .field select:focus {
    outline: none;
  }
  .field input:disabled {
    color: var(--color-fg-tertiary);
    background: var(--color-bg-hover);
  }
  .disclosure {
    background: transparent;
    color: var(--color-accent);
    padding: 6px 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
    align-self: flex-start;
  }
  .advanced {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
  }
  .hint {
    margin: 0;
    color: var(--color-fg-tertiary);
    font-size: var(--text-xs);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }
</style>
