<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { backToChat } from '../lib/state/mainRoute.svelte';
  import Button from '../lib/Button.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import { copyToClipboard } from '../lib/clipboard';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    /** When set, the QR is a group/broadcast invite for this chat. */
    chatId?: number | null;
  };

  let { chatId = null }: Props = $props();

  /** qxp-hosted invite landing page (see relay www/src/invite.md). */
  const INVITE_BASE = 'https://qxp.chat/invite/';

  let svg = $state<string | null>(null);
  /** Raw QR string from the daemon — kept verbatim for set_config_from_qr. */
  let url = $state<string | null>(null);
  let error = $state<string | null>(null);
  let withdrawOpen = $state(false);
  let pasteResult = $state<string | null>(null);

  /**
   * Rewrite the daemon QR string into a qxp-hosted invite link. The daemon
   * returns either `OPENPGP4FPR:<fpr>#<params>` or the Delta-Chat-operated
   * `https://i.delta.chat/#<fpr>&<params>` mirror; both carry the same
   * payload. The invite page parses `#<fpr>&<params>`, so:
   *  - i.delta.chat mirror → swap origin, hash is already compatible.
   *  - openpgp4fpr scheme  → drop the scheme, turn the `#` separator into `&`.
   * Anything unrecognised is passed through untouched.
   */
  function toInviteLink(raw: string): string {
    const mirror = /^https:\/\/i\.delta\.chat\/#?/i;
    if (mirror.test(raw)) {
      return raw.replace(mirror, `${INVITE_BASE}#`);
    }
    const fpr = /^openpgp4fpr:/i;
    if (fpr.test(raw)) {
      return `${INVITE_BASE}#${raw.replace(fpr, '').replace('#', '&')}`;
    }
    return raw;
  }

  /** What the user sees, copies and shares — always the qxp invite link. */
  let shareUrl = $derived(url ? toInviteLink(url) : null);

  /**
   * Inverse of toInviteLink: turn a qxp invite link back into the
   * `OPENPGP4FPR:` scheme that the daemon's check_qr understands. Used on
   * paste so a link copied from another qxp install round-trips. Non-qxp
   * input (raw openpgp4fpr, i.delta.chat, dclogin, …) passes straight to
   * the daemon, which already recognises those.
   */
  function fromInviteLink(text: string): string {
    const base = /^https:\/\/qxp\.chat\/invite\/?#/i;
    if (base.test(text)) {
      return `OPENPGP4FPR:${text.replace(base, '').replace('&', '#')}`;
    }
    return text;
  }

  async function load() {
    if (accounts.selectedId == null) return;
    error = null;
    try {
      // Daemon returns (qr_url, svg_markup) — note the order is URL first.
      const [qrUrl, qrSvg] = await rpc.call<[string, string]>(
        'get_chat_securejoin_qr_code_svg',
        [accounts.selectedId, chatId],
      );
      url = qrUrl;
      svg = qrSvg;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  onMount(load);
  $effect(() => {
    void chatId;
    void load();
  });

  async function copy() {
    if (!shareUrl) return;
    await copyToClipboard(shareUrl, t('Link copied to clipboard'));
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && accounts.selectedId != null) {
        const qr = fromInviteLink(text.trim());
        const obj = await rpc.call<{ kind: string }>('check_qr', [accounts.selectedId, qr]);
        pasteResult = `${t('Scanned')}: ${obj.kind}`;
      }
    } catch (err) {
      pasteResult = `${t('Paste failed')}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function confirmWithdraw() {
    if (!url || accounts.selectedId == null) return;
    try {
      await rpc.call('set_config_from_qr', [accounts.selectedId, url]);
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<section class="qr-show" data-testid="qr-show" data-scope={chatId == null ? 'self' : 'chat'}>
  <header class="topbar" data-tauri-drag-region>
    <BackButton label={t('Back')} onclick={backToChat} data-testid="qr-show__back" />
    <h1>{chatId == null ? t('Your QR') : t('Group invite')}</h1>
  </header>

  <div class="body">
    {#if error}
      <p class="error" data-testid="qr-show__error">{error}</p>
    {:else if svg}
      <div class="card" data-testid="qr-show__card">
        <!-- daemon-trusted SVG; safe to render -->
        <div class="svg-wrap" data-testid="qr-show__svg">{@html svg}</div>
        {#if shareUrl}
          <p class="url" title={shareUrl} data-testid="qr-show__url">{shareUrl}</p>
        {/if}
        <div class="actions">
          <Button variant="secondary" size="sm" onclick={copy} data-testid="qr-show__copy">
            {t('Copy link')}
          </Button>
          <Button variant="secondary" size="sm" onclick={paste} data-testid="qr-show__paste">
            {t('Paste code')}
          </Button>
          <Button variant="danger-text" size="sm" onclick={() => (withdrawOpen = true)} data-testid="qr-show__withdraw">
            {t('Withdraw')}
          </Button>
        </div>
      </div>
    {:else}
      <p class="hint" data-testid="qr-show__loading">{t('Generating QR…')}</p>
    {/if}
  </div>
</section>

<ConfirmDialog
  open={withdrawOpen}
  title={t('Withdraw this invite QR?')}
  message={t('Anyone holding it will no longer be able to join.')}
  confirmLabel={t('Withdraw')}
  danger
  onConfirm={() => void confirmWithdraw()}
  onClose={() => (withdrawOpen = false)}
/>

<ConfirmDialog
  open={pasteResult != null}
  mode="alert"
  title={pasteResult ?? ''}
  onClose={() => (pasteResult = null)}
/>

<style>
  .qr-show {
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
    overflow-y: auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .card {
    width: min(420px, 100%);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    box-shadow: 0 8px 24px var(--color-shadow);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .svg-wrap {
    width: 280px;
    height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .svg-wrap :global(svg) {
    width: 100%;
    height: 100%;
  }
  .url {
    font-size: var(--text-xs);
    color: var(--color-fg-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    /* Defensive: even if a future deltachat-core lengthens the QR payload,
     * keep the row from pushing the card wider than it should be. */
    min-width: 0;
    word-break: break-all;
  }
  .actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    justify-content: center;
  }
  .hint {
    color: var(--color-fg-secondary);
    margin-top: var(--space-5);
  }
  .error {
    color: var(--color-danger);
    text-align: center;
  }
</style>
