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
  import Button from '../lib/Button.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import TextInput from '../lib/TextInput.svelte';
  import { copyToClipboard } from '../lib/clipboard';
  import { fromQxpInviteUrl } from '../lib/inviteUrl';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    purpose: 'newContact' | 'general';
    /** Pre-supplied QR string (deep link) — processed without the camera. */
    code?: string;
    onSelectChat: (chatId: number) => void;
  };

  let { purpose, code, onSelectChat }: Props = $props();

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
  // Fallback input for users without a camera (and for headless E2E
  // tests) — pasting a QR URL feeds the same `onScanned` pipeline.
  let pasteText = $state('');

  async function onScanned(raw: string) {
    if (accounts.selectedId == null) return;
    errorMsg = null;
    busy = true;
    try {
      // qxp-branded invite URLs (`https://qxp.chat/invite/#…`) must be
      // rewritten to OPENPGP4FPR before dc-core's `check_qr` sees them;
      // every other scheme it already recognises natively.
      const code = fromQxpInviteUrl(raw);
      const obj = await rpc.call<QrObject>('check_qr', [accounts.selectedId, code]);
      qr = { raw: code, obj };
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

  // A `code` prop means the dispatcher was opened by a deep link — run it
  // through the same `check_qr` pipeline as a camera scan. Tracked against
  // `lastCode` so re-renders don't reprocess, while a fresh deep link
  // arriving on the already-open dispatcher still fires.
  let lastCode: string | undefined;
  $effect(() => {
    if (code && code !== lastCode) {
      lastCode = code;
      void onScanned(code);
    }
  });

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
          await copyToClipboard(qr.obj.text, t('Text copied to clipboard'));
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
    if (!qr) return purpose === 'newContact' ? t('New Contact — Scan QR') : t('Scan QR');
    switch (qr.obj.kind) {
      case 'askVerifyContact':
        return t('Verify and start chat?');
      case 'askVerifyGroup':
        return t('Join group');
      case 'askJoinBroadcast':
        return t('Join channel');
      case 'fprOk':
        return t('Fingerprint verified');
      case 'fprMismatch':
        return t('Fingerprint mismatch');
      case 'fprWithoutAddr':
        return t('Incomplete contact code');
      case 'addr':
        return t('Start chat?');
      case 'url':
        return t('Open URL?');
      case 'text':
        return t('Copy text?');
      case 'account':
        return t('Account QR scanned');
      case 'backup2':
      case 'backupTooNew':
        return t('Backup pair');
      case 'webrtcInstance':
        return t('Use video service?');
      case 'proxy':
        return t('Add proxy?');
      case 'login':
        return t('Login QR scanned');
      case 'withdrawVerifyContact':
      case 'withdrawVerifyGroup':
      case 'withdrawJoinBroadcast':
        return t('Withdraw your QR?');
      case 'reviveVerifyContact':
      case 'reviveVerifyGroup':
      case 'reviveJoinBroadcast':
        return t('Revive your QR?');
    }
  });

  let body = $derived.by(() => {
    if (!qr) return '';
    switch (qr.obj.kind) {
      case 'askVerifyContact':
        return t('Start a verified chat with this contact.');
      case 'askVerifyGroup':
        return t('Join group “{name}”.', { name: qr.obj.grpname });
      case 'askJoinBroadcast':
        return t('Join channel “{name}”.', { name: qr.obj.name });
      case 'fprOk':
        return t('Fingerprint matched. Start chat?');
      case 'addr':
        return qr.obj.draft
          ? t('Start a chat. Suggested first message: “{draft}”.', { draft: qr.obj.draft })
          : t('Start a chat with this contact?');
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
        return t('Start chat');
      case 'askVerifyGroup':
      case 'askJoinBroadcast':
        return t('Join');
      case 'url':
        return t('Open');
      case 'text':
        return t('Copy');
      case 'proxy':
      case 'webrtcInstance':
      case 'login':
        return t('Apply');
      case 'withdrawVerifyContact':
      case 'withdrawVerifyGroup':
      case 'withdrawJoinBroadcast':
        return t('Withdraw');
      case 'reviveVerifyContact':
      case 'reviveVerifyGroup':
      case 'reviveJoinBroadcast':
        return t('Revive');
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

<section class="qr" data-testid="qr-dispatcher" data-purpose={purpose}>
  <header class="topbar" data-tauri-drag-region>
    <BackButton label={t('Back')} onclick={backToChat} data-testid="qr-dispatcher__back" />
    <h1>{title}</h1>
  </header>

  <div class="body">
    {#if !qr}
      {#key scannerKey}
        <Scanner onResult={onScanned} onError={(m) => (errorMsg = m)} />
      {/key}
      <p class="hint">{t('Position the QR code inside the frame.')}</p>

      <div class="paste-fallback">
        <span class="paste-label">{t('Or paste a QR code:')}</span>
        <TextInput
          bind:value={pasteText}
          placeholder="openpgp4fpr:… / dcaccount:… / OPENPGP4FPR:…"
          data-testid="qr-dispatcher__paste-input"
        />
        <Button
          class="paste-submit"
          variant="primary"
          size="sm"
          disabled={!pasteText.trim() || busy}
          onclick={() => {
            const code = pasteText.trim();
            if (code) void onScanned(code);
          }}
          data-testid="qr-dispatcher__paste-submit"
        >
          {t('Use this code')}
        </Button>
      </div>

      {#if errorMsg}
        <p class="error" data-testid="qr-dispatcher__error">{errorMsg}</p>
      {/if}
      {#if busy}
        <p class="hint">{t('Checking…')}</p>
      {/if}
    {:else}
      <div class="card" data-testid="qr-dispatcher__card" data-qr-kind={qr.obj.kind}>
        <h2 data-testid="qr-dispatcher__title">{title}</h2>
        {#if body}
          <p class="text" data-testid="qr-dispatcher__body">{body}</p>
        {/if}
        {#if errorMsg}
          <p class="error">{errorMsg}</p>
        {/if}
        <div class="actions">
          <Button variant="secondary" onclick={reset} disabled={busy} data-testid="qr-dispatcher__reset">{t('Scan again')}</Button>
          {#if actionLabel}
            <Button variant="primary" onclick={confirmCurrent} disabled={busy} data-testid="qr-dispatcher__confirm">{actionLabel}</Button>
          {:else}
            <Button variant="primary" onclick={() => backToChat()} disabled={busy} data-testid="qr-dispatcher__ok">{t('OK')}</Button>
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
    padding: calc(var(--space-3) + var(--titlebar-gutter)) var(--space-4) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
    flex: 0 0 auto;
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
  .paste-fallback {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: min(420px, 100%);
    margin-top: var(--space-3);
    padding: var(--space-3);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
  }
  .paste-label {
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
  }
  .paste-fallback :global(.paste-submit) {
    align-self: flex-end;
  }
</style>
