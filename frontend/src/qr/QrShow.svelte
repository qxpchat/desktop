<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { backToChat } from '../lib/state/mainRoute.svelte';
  import Button from '../lib/Button.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import { copyToClipboard } from '../lib/clipboard';
  import { toQxpInviteUrl, fromQxpInviteUrl } from '../lib/inviteUrl';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    /** When set, the QR is a group/broadcast invite for this chat. */
    chatId?: number | null;
  };

  let { chatId = null }: Props = $props();

  let svg = $state<string | null>(null);
  /** Raw QR string from the daemon — the canonical `OPENPGP4FPR:<fpr>#<params>`
   *  URI. Universal: every Delta-Chat-compatible client recognises it
   *  in its add-contact paste box. */
  let url = $state<string | null>(null);
  let error = $state<string | null>(null);
  let withdrawOpen = $state(false);
  let pasteResult = $state<string | null>(null);

  /** qxp-branded invite landing URL, derived from the raw OPENPGP4FPR
   *  URI. Shareable link that opens in any browser; round-trippable
   *  back to OPENPGP4FPR via `fromQxpInviteUrl` for `check_qr`. */
  let webLink = $derived(url ? toQxpInviteUrl(url) : null);

  async function load() {
    if (accounts.selectedId == null) return;
    error = null;
    try {
      // Raw QR text first (`OPENPGP4FPR:<fpr>#<params>` per the qxp
      // dc-core fork), then a separately-rendered SVG of *that text*.
      // Encoding the OPENPGP4FPR URI in the QR — not a wrapped URL —
      // keeps every DC-compatible scanner / paste box happy.
      const raw = await rpc.call<string>('get_chat_securejoin_qr_code', [accounts.selectedId, chatId]);
      const qrSvg = await rpc.call<string>('create_qr_svg', [raw]);
      url = raw;
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

  /** "Copy" sends the raw `OPENPGP4FPR:` URI. Universal across every
   *  Delta-Chat-compatible client's add-contact input. */
  async function copy() {
    if (!url) return;
    await copyToClipboard(url, t('Code copied to clipboard'));
  }

  /** "Copy web-link" sends the qxp-branded `https://qxp.chat/invite/#…`
   *  URL — same payload, link-friendly, opens a qxp landing page in
   *  any browser. */
  async function copyWebLink() {
    if (!webLink) return;
    await copyToClipboard(webLink, t('Link copied to clipboard'));
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && accounts.selectedId != null) {
        // dc-core's `check_qr` natively accepts OPENPGP4FPR,
        // i.delta.chat, dclogin, dcaccount — but not our branded
        // `qxp.chat/invite/#…` host. `fromQxpInviteUrl` rewrites
        // qxp invite URLs back to OPENPGP4FPR before the round-trip;
        // anything else passes through.
        const code = fromQxpInviteUrl(text.trim());
        const obj = await rpc.call<{ kind: string }>('check_qr', [accounts.selectedId, code]);
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
        {#if webLink}
          <p class="url" title={webLink} data-testid="qr-show__url">{webLink}</p>
        {/if}
        <div class="actions">
          <Button variant="secondary" size="sm" onclick={copy} data-testid="qr-show__copy">
            {t('Copy')}
          </Button>
          <Button variant="secondary" size="sm" onclick={copyWebLink} data-testid="qr-show__copy-web-link">
            {t('Copy web-link')}
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
