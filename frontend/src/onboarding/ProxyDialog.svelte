<script lang="ts" module>
  export type Props = {
    open: boolean;
    onClose: () => void;
  };
</script>

<script lang="ts">
  // Set a SOCKS / Shadowsocks / HTTP proxy *before* onboarding starts, so
  // dc-core reaches the relay through it. Stored in
  // `lib/state/onboarding.svelte → pendingProxy`; `runOnboardingFlow`
  // applies it via `set_config_from_qr` right after `add_account`.
  //
  // Validation is intentionally lax — a syntactic prefix check covers
  // the four schemes dc-core supports (`socks5:`, `ss:`, `http:`, the
  // `proxy:` URI scheme used by QR exports). Full `check_qr`-style
  // validation needs an account context, which we don't have until
  // signup actually runs — that path will surface a real error in the
  // ProgressOverlay if the URL is malformed.

  import Modal from '../lib/Modal.svelte';
  import Button from '../lib/Button.svelte';
  import TextInput from '../lib/TextInput.svelte';
  import { pendingProxy, setPendingProxy } from '../lib/state/onboarding.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  let { open, onClose }: Props = $props();

  let value = $state('');
  let errorMsg = $state<string | null>(null);

  $effect(() => {
    if (open) {
      value = pendingProxy.url ?? '';
      errorMsg = null;
    }
  });

  const ACCEPTED_PREFIXES = ['socks5:', 'ss:', 'http:', 'https:', 'proxy:'];

  function save() {
    const url = value.trim();
    if (url === '') {
      setPendingProxy(null);
      onClose();
      return;
    }
    const lower = url.toLowerCase();
    if (!ACCEPTED_PREFIXES.some((p) => lower.startsWith(p))) {
      errorMsg = t('Use a `socks5:`, `ss:`, `http(s):`, or `proxy:` URL.');
      return;
    }
    setPendingProxy(url);
    onClose();
  }

  function clearProxy() {
    setPendingProxy(null);
    value = '';
    onClose();
  }
</script>

<Modal {open} {onClose} size="sm" ariaLabel={t('Connection settings')} data-testid="onboarding-proxy-dialog">
  <div class="content">
    <h2>{t('Use a proxy')}</h2>
    <p>{t('Route the configuration handshake through this proxy. Leave blank to connect directly.')}</p>
    <TextInput
      bind:value
      placeholder="socks5://user:pass@host:1080"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      data-testid="onboarding-proxy-dialog__input"
    />
    {#if errorMsg}
      <p class="error" data-testid="onboarding-proxy-dialog__error">{errorMsg}</p>
    {/if}
    <div class="actions">
      <Button variant="primary" onclick={save} data-testid="onboarding-proxy-dialog__save">
        {t('Save')}
      </Button>
      {#if pendingProxy.url}
        <Button variant="danger-text" onclick={clearProxy} data-testid="onboarding-proxy-dialog__clear">
          {t('Stop using proxy')}
        </Button>
      {/if}
      <Button variant="secondary" onclick={onClose} data-testid="onboarding-proxy-dialog__cancel">
        {t('Cancel')}
      </Button>
    </div>
  </div>
</Modal>

<style>
  .content {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .error {
    color: var(--color-danger);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: var(--space-2);
  }
</style>
