<script lang="ts">
  // Pane-3 view that scans a QR code, runs `check_qr`, and offers an
  // appropriate confirmation. Phase 5 covers the contact-creation cases
  // (AskVerifyContact, FprOk, Addr); Phase 11 fills in the rest of the
  // DC_QR_* matrix (withdraw/revive, group invites, broadcast invites,
  // proxy, login, etc.).

  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { backToChat } from '../lib/state/mainRoute.svelte';
  import Scanner from './Scanner.svelte';

  type Props = {
    purpose: 'newContact' | 'general';
    onSelectChat: (chatId: number) => void;
  };

  let { purpose, onSelectChat }: Props = $props();

  type QrObject =
    | { kind: 'askVerifyContact'; contactId: number; fingerprint: string; invitenumber: string; authcode: string; isV3: boolean }
    | { kind: 'askVerifyGroup'; grpname: string; grpid: string; contactId: number; fingerprint: string; invitenumber: string; authcode: string; isV3: boolean }
    | { kind: 'askJoinBroadcast'; name: string; grpid: string; contactId: number; fingerprint: string; invitenumber: string; authcode: string; isV3: boolean }
    | { kind: 'fprOk'; contactId: number }
    | { kind: 'fprMismatch'; contactId: number | null }
    | { kind: 'fprWithoutAddr'; fingerprint: string }
    | { kind: 'addr'; contactId: number; draft: string | null }
    | { kind: 'url'; url: string }
    | { kind: 'text'; text: string }
    | { kind: 'account'; domain: string }
    | { kind: 'backup2'; authToken: string; nodeAddr: string }
    | { kind: 'backupTooNew' }
    | { kind: 'webrtcInstance'; domain: string; instancePattern: string }
    | { kind: 'proxy'; url: string; host: string; port: number }
    | { kind: 'withdrawVerifyContact'; contactId: number; fingerprint: string; invitenumber: string; authcode: string }
    | { kind: 'withdrawVerifyGroup'; grpname: string; grpid: string; contactId: number; fingerprint: string; invitenumber: string; authcode: string }
    | { kind: 'withdrawJoinBroadcast'; name: string; grpid: string; contactId: number; fingerprint: string; invitenumber: string; authcode: string }
    | { kind: 'reviveVerifyContact'; contactId: number; fingerprint: string; invitenumber: string; authcode: string }
    | { kind: 'reviveVerifyGroup'; grpname: string; grpid: string; contactId: number; fingerprint: string; invitenumber: string; authcode: string }
    | { kind: 'reviveJoinBroadcast'; name: string; grpid: string; contactId: number; fingerprint: string; invitenumber: string; authcode: string }
    | { kind: 'login'; address: string };

  let qr = $state<{ raw: string; obj: QrObject } | null>(null);
  let busy = $state(false);
  let errorMsg = $state<string | null>(null);
  let scannerKey = $state(0);

  async function onScanned(raw: string) {
    if (accounts.selectedId == null) return;
    errorMsg = null;
    busy = true;
    try {
      const obj = await rpc.call<QrObject>('check_qr', [accounts.selectedId, raw]);
      qr = { raw, obj };
    } catch (err) {
      errorMsg = `Could not parse QR: ${err instanceof Error ? err.message : String(err)}`;
      scannerKey += 1;
    } finally {
      busy = false;
    }
  }

  function reset() {
    qr = null;
    errorMsg = null;
    scannerKey += 1;
  }

  async function confirmCurrent() {
    if (!qr || accounts.selectedId == null) return;
    const accountId = accounts.selectedId;
    busy = true;
    try {
      switch (qr.obj.kind) {
        case 'askVerifyContact':
        case 'askVerifyGroup':
        case 'askJoinBroadcast': {
          const chatId = await rpc.call<number>('secure_join', [accountId, qr.raw]);
          onSelectChat(chatId);
          backToChat();
          return;
        }
        case 'fprOk':
        case 'addr': {
          const chatId = await rpc.call<number>('create_chat_by_contact_id', [
            accountId,
            qr.obj.contactId,
          ]);
          onSelectChat(chatId);
          backToChat();
          return;
        }
        case 'url':
          window.open(qr.obj.url, '_blank', 'noopener');
          backToChat();
          return;
        case 'text':
          await navigator.clipboard.writeText(qr.obj.text);
          backToChat();
          return;
        case 'proxy':
        case 'webrtcInstance':
        case 'login':
          await rpc.call('set_config_from_qr', [accountId, qr.raw]);
          backToChat();
          return;
        case 'withdrawVerifyContact':
        case 'withdrawVerifyGroup':
        case 'withdrawJoinBroadcast':
        case 'reviveVerifyContact':
        case 'reviveVerifyGroup':
        case 'reviveJoinBroadcast':
          await rpc.call('set_config_from_qr', [accountId, qr.raw]);
          reset();
          return;
        case 'account':
        case 'backup2':
        case 'backupTooNew':
          errorMsg = 'This QR is for onboarding. Sign out first to use it.';
          return;
        case 'fprMismatch':
        case 'fprWithoutAddr':
          errorMsg = 'Fingerprint did not match. Try scanning again.';
          return;
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  let title = $derived.by(() => {
    if (!qr) return purpose === 'newContact' ? 'New Contact — Scan QR' : 'Scan QR';
    switch (qr.obj.kind) {
      case 'askVerifyContact':
        return 'Verify and start chat?';
      case 'askVerifyGroup':
        return 'Join group';
      case 'askJoinBroadcast':
        return 'Join channel';
      case 'fprOk':
        return 'Fingerprint verified';
      case 'fprMismatch':
        return 'Fingerprint mismatch';
      case 'fprWithoutAddr':
        return 'Incomplete contact code';
      case 'addr':
        return 'Start chat?';
      case 'url':
        return 'Open URL?';
      case 'text':
        return 'Copy text?';
      case 'account':
        return 'Account QR scanned';
      case 'backup2':
      case 'backupTooNew':
        return 'Backup pair';
      case 'webrtcInstance':
        return 'Use video service?';
      case 'proxy':
        return 'Add proxy?';
      case 'login':
        return 'Login QR scanned';
      case 'withdrawVerifyContact':
      case 'withdrawVerifyGroup':
      case 'withdrawJoinBroadcast':
        return 'Withdraw your QR?';
      case 'reviveVerifyContact':
      case 'reviveVerifyGroup':
      case 'reviveJoinBroadcast':
        return 'Revive your QR?';
    }
  });

  let body = $derived.by(() => {
    if (!qr) return '';
    switch (qr.obj.kind) {
      case 'askVerifyContact':
        return 'Start a verified chat with this contact.';
      case 'askVerifyGroup':
        return `Join group “${qr.obj.grpname}”.`;
      case 'askJoinBroadcast':
        return `Join channel “${qr.obj.name}”.`;
      case 'fprOk':
        return 'Fingerprint matched. Start chat?';
      case 'addr':
        return qr.obj.draft
          ? `Start a chat. Suggested first message: “${qr.obj.draft}”.`
          : 'Start a chat with this contact?';
      case 'url':
        return qr.obj.url;
      case 'text':
        return qr.obj.text;
      case 'proxy':
        return `${qr.obj.host}:${qr.obj.port}`;
      case 'login':
        return qr.obj.address;
      case 'account':
        return qr.obj.domain;
      case 'webrtcInstance':
        return qr.obj.instancePattern;
      default:
        return '';
    }
  });

  let actionLabel = $derived.by(() => {
    if (!qr) return '';
    switch (qr.obj.kind) {
      case 'askVerifyContact':
      case 'fprOk':
      case 'addr':
        return 'Start chat';
      case 'askVerifyGroup':
      case 'askJoinBroadcast':
        return 'Join';
      case 'url':
        return 'Open';
      case 'text':
        return 'Copy';
      case 'proxy':
      case 'webrtcInstance':
      case 'login':
        return 'Apply';
      case 'withdrawVerifyContact':
      case 'withdrawVerifyGroup':
      case 'withdrawJoinBroadcast':
        return 'Withdraw';
      case 'reviveVerifyContact':
      case 'reviveVerifyGroup':
      case 'reviveJoinBroadcast':
        return 'Revive';
      default:
        return '';
    }
  });

  // Currently informational only — UI string switching uses `title` derived
  // above; the prop is here for Phase 11 to differentiate flows. Touch it so
  // svelte-check's "unused state" warning stays quiet.
  $effect(() => {
    void purpose;
  });
</script>

<section class="qr">
  <header class="topbar">
    <button class="back" onclick={backToChat} aria-label="Back">‹ Back</button>
    <h1>{title}</h1>
  </header>

  <div class="body">
    {#if !qr}
      {#key scannerKey}
        <Scanner onResult={onScanned} onError={(m) => (errorMsg = m)} />
      {/key}
      <p class="hint">Position the QR code inside the frame.</p>
      {#if errorMsg}
        <p class="error">{errorMsg}</p>
      {/if}
      {#if busy}
        <p class="hint">Checking…</p>
      {/if}
    {:else}
      <div class="card">
        <h2>{title}</h2>
        {#if body}
          <p class="text">{body}</p>
        {/if}
        {#if errorMsg}
          <p class="error">{errorMsg}</p>
        {/if}
        <div class="actions">
          <button onclick={reset} disabled={busy}>Scan again</button>
          {#if actionLabel}
            <button class="primary" onclick={confirmCurrent} disabled={busy}>{actionLabel}</button>
          {:else}
            <button class="primary" onclick={() => backToChat()} disabled={busy}>OK</button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .qr {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
    min-height: 56px;
    flex: 0 0 auto;
  }
  .back {
    color: var(--color-accent);
    font-size: var(--text-md);
  }
  h1 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-4);
    padding: var(--space-5);
    overflow-y: auto;
  }
  .hint {
    color: var(--color-fg-secondary);
    margin: 0;
  }
  .error {
    color: var(--color-danger);
    margin: 0;
    text-align: center;
  }
  .card {
    width: min(420px, 100%);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    box-shadow: 0 8px 24px var(--color-shadow);
  }
  .card h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .text {
    margin: 0 0 var(--space-3) 0;
    color: var(--color-fg-secondary);
    word-break: break-word;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
  .actions button {
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    font-weight: 600;
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .actions button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .actions .primary {
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .actions .primary:hover:not(:disabled) {
    filter: brightness(1.05);
  }
</style>
