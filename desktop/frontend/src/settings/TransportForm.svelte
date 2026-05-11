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
  const securityOptions = [
    { value: 'automatic', label: 'Automatic' },
    { value: 'ssl', label: 'SSL/TLS' },
    { value: 'starttls', label: 'StartTLS' },
    { value: 'plain', label: 'Off' },
  ];

  const certOptions = [
    { value: 'automatic', label: 'Automatic' },
    { value: 'strict', label: 'Strict' },
    { value: 'acceptInvalidCertificates', label: 'Accept Invalid Certificates' },
  ];

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

<div class="overlay" role="dialog" aria-modal="true">
  <div class="dialog">
    <header class="head">
      <h3>{isEdit ? 'Edit Relay' : 'Manual Setup'}</h3>
      <button class="close" onclick={onCancel} aria-label="Cancel"><Icon name="x" size={16} /></button>
    </header>

    <div class="form">
      <label class="field">
        <span>Email</span>
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
        <span>Password</span>
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
        More options
      </button>

      {#if advancedOpen}
        <div class="advanced">
          <label class="field">
            <span>IMAP Security</span>
            <select bind:value={imapSecurity}>
              {#each securityOptions as o (o.value)}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>IMAP Login</span>
            <input bind:value={imapUser} placeholder="Automatic" autocapitalize="off" autocorrect="off" spellcheck="false" />
          </label>
          <label class="field">
            <span>IMAP Server</span>
            <input bind:value={imapServer} placeholder="Automatic" autocapitalize="off" autocorrect="off" spellcheck="false" />
          </label>
          <label class="field">
            <span>IMAP Port</span>
            <input
              bind:value={imapPort}
              placeholder="Automatic"
              inputmode="numeric"
              pattern="\d*"
            />
          </label>

          <label class="field">
            <span>SMTP Security</span>
            <select bind:value={smtpSecurity}>
              {#each securityOptions as o (o.value)}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>SMTP Login</span>
            <input bind:value={smtpUser} placeholder="Automatic" autocapitalize="off" autocorrect="off" spellcheck="false" />
          </label>
          <label class="field">
            <span>SMTP Password</span>
            <input type="password" bind:value={smtpPassword} placeholder="Automatic" />
          </label>
          <label class="field">
            <span>SMTP Server</span>
            <input bind:value={smtpServer} placeholder="Automatic" autocapitalize="off" autocorrect="off" spellcheck="false" />
          </label>
          <label class="field">
            <span>SMTP Port</span>
            <input
              bind:value={smtpPort}
              placeholder="Automatic"
              inputmode="numeric"
              pattern="\d*"
            />
          </label>

          <label class="field">
            <span>Certificate Check</span>
            <select bind:value={certificateChecks}>
              {#each certOptions as o (o.value)}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
          </label>

          <p class="hint">Leave fields blank to detect automatically.</p>
        </div>
      {/if}
    </div>

    <div class="actions">
      <button onclick={onCancel}>Cancel</button>
      <button class="primary" onclick={submit} disabled={!canSubmit}>
        {isEdit ? 'Save' : 'Add'}
      </button>
    </div>
  </div>
</div>

<style>
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
  .dialog {
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    width: min(520px, calc(100vw - 2 * var(--space-4)));
    max-height: calc(100vh - 2 * var(--space-4));
    overflow-y: auto;
    box-shadow: 0 16px 48px var(--color-shadow);
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
  .close {
    background: transparent;
    color: var(--color-fg-tertiary);
    padding: 4px;
    border-radius: var(--radius-sm);
  }
  .close:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
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
    outline: 2px solid var(--color-accent);
    outline-offset: -1px;
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
  .actions button {
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    font-weight: 600;
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .actions .primary {
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .actions .primary:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  .actions button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
