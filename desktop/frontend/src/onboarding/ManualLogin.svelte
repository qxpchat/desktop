<script lang="ts">
  import { onboarding, loginManually } from '../lib/state/onboarding.svelte';
  import ProgressOverlay from './ProgressOverlay.svelte';

  type Props = {
    onBack: () => void;
  };

  let { onBack }: Props = $props();

  let addr = $state('');
  let mailPw = $state('');
  let advancedOpen = $state(false);

  // Advanced overrides — passed as deltachat config keys when non-empty.
  let mail_server = $state('');
  let mail_port = $state('');
  let mail_security = $state('');
  let send_server = $state('');
  let send_port = $state('');
  let send_security = $state('');
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
    if (imap_certificate_checks) advanced.imap_certificate_checks = imap_certificate_checks;

    try {
      await loginManually(addr.trim(), mailPw, advanced);
    } catch {
      /* error surfaced via onboarding.phase */
    }
  }
</script>

<header class="topbar">
  <button class="back" onclick={onBack} aria-label="Back">‹ Back</button>
  <h1>Manual Setup</h1>
</header>

<main class="manual">
  <label class="field">
    <span class="label">Email</span>
    <input
      type="email"
      bind:value={addr}
      autocomplete="email"
      placeholder="you@example.com"
      autocapitalize="off"
      spellcheck="false"
    />
  </label>

  <label class="field">
    <span class="label">Password</span>
    <input type="password" bind:value={mailPw} autocomplete="current-password" />
  </label>

  <button class="advanced-toggle" onclick={() => (advancedOpen = !advancedOpen)} aria-expanded={advancedOpen}>
    {advancedOpen ? '▾' : '▸'} Advanced
  </button>

  {#if advancedOpen}
    <fieldset>
      <legend>IMAP (incoming)</legend>
      <label class="field">
        <span class="label">Server</span>
        <input bind:value={mail_server} placeholder="imap.example.com" autocapitalize="off" spellcheck="false" />
      </label>
      <label class="field">
        <span class="label">Port</span>
        <input type="number" bind:value={mail_port} placeholder="993" />
      </label>
      <label class="field">
        <span class="label">Security</span>
        <select bind:value={mail_security}>
          <option value="">Auto</option>
          <option value="1">SSL/TLS</option>
          <option value="2">STARTTLS</option>
          <option value="3">Plain</option>
        </select>
      </label>
      <label class="field">
        <span class="label">Cert check</span>
        <select bind:value={imap_certificate_checks}>
          <option value="">Auto</option>
          <option value="1">Strict</option>
          <option value="3">Accept invalid</option>
        </select>
      </label>
    </fieldset>

    <fieldset>
      <legend>SMTP (outgoing)</legend>
      <label class="field">
        <span class="label">Server</span>
        <input bind:value={send_server} placeholder="smtp.example.com" autocapitalize="off" spellcheck="false" />
      </label>
      <label class="field">
        <span class="label">Port</span>
        <input type="number" bind:value={send_port} placeholder="465" />
      </label>
      <label class="field">
        <span class="label">Security</span>
        <select bind:value={send_security}>
          <option value="">Auto</option>
          <option value="1">SSL/TLS</option>
          <option value="2">STARTTLS</option>
          <option value="3">Plain</option>
        </select>
      </label>
    </fieldset>
  {/if}

  <button class="primary" disabled={!canLogin} onclick={login}>Log In</button>
</main>

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
  .manual {
    max-width: 420px;
    margin: 0 auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .label {
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
    font-weight: 500;
  }
  input,
  select {
    height: 40px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg-pane);
    font-size: var(--text-md);
  }
  input:focus,
  select:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  .advanced-toggle {
    align-self: flex-start;
    padding: var(--space-2) 0;
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .advanced-toggle:hover {
    color: var(--color-fg);
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
  .primary {
    margin-top: var(--space-3);
    height: 48px;
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
    font-size: var(--text-md);
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .primary:not(:disabled):hover {
    filter: brightness(1.05);
  }
</style>
