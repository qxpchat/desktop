<script lang="ts">
  import Logo from '../lib/Logo.svelte';
  import Button from '../lib/Button.svelte';
  import MenuItem from '../lib/MenuItem.svelte';
  import Icon from '../lib/Icon.svelte';
  import ProxyDialog from './ProxyDialog.svelte';
  import { pendingProxy } from '../lib/state/onboarding.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onSignUp: () => void;
    onManualSetup: () => void;
    onRestoreBackup: () => void;
    onAddAsSecondDevice: () => void;
    onScan: () => void;
  };

  let { onSignUp, onManualSetup, onRestoreBackup, onAddAsSecondDevice, onScan }: Props = $props();

  let altMenuOpen = $state(false);
  let proxyOpen = $state(false);

  // Extract host[:port] for the indicator chip — full URL is too long.
  let proxyHost = $derived.by(() => {
    const url = pendingProxy.url;
    if (!url) return '';
    const m = /^[a-z0-9+-.]+:(?:\/\/)?(?:[^@/]+@)?([^/?#]+)/i.exec(url);
    return m?.[1] ?? url;
  });

  function signUp() {
    onSignUp();
  }
  function manualSetup() {
    altMenuOpen = false;
    onManualSetup();
  }
  function restoreBackup() {
    altMenuOpen = false;
    onRestoreBackup();
  }
  function addAsSecondDevice() {
    altMenuOpen = false;
    onAddAsSecondDevice();
  }
  function scan() {
    altMenuOpen = false;
    onScan();
  }

  function toggleAlt() {
    altMenuOpen = !altMenuOpen;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') altMenuOpen = false;
  }
</script>

<svelte:window onkeydown={onKey} />

<main class="welcome" data-testid="onboarding-welcome">
  <div class="brand">
    <div class="logo-wrap">
      <Logo size="clamp(96px, 22vw, 168px)" />
    </div>
    <div class="wordmark">qxp</div>
    <p class="tagline">{t('Chat over Email')}</p>
  </div>

  <div class="actions">
    <Button variant="primary" size="lg" block onclick={signUp} data-testid="onboarding-welcome__sign-up">{t('Sign Up')}</Button>

    <div class="alt">
      <Button
        variant="accent-text"
        size="lg"
        block
        aria-haspopup="menu"
        aria-expanded={altMenuOpen}
        onclick={toggleAlt}
        data-testid="onboarding-welcome__alt-toggle"
      >
        {t('I Already Have a Profile')}
      </Button>

      {#if altMenuOpen}
        <div class="alt-menu" role="menu">
          <MenuItem label={t('Scan Invitation Code')} onclick={scan} data-testid="onboarding-welcome__scan" />
          <MenuItem label={t('Manual Setup')} onclick={manualSetup} data-testid="onboarding-welcome__manual-setup" />
          <MenuItem label={t('Restore Backup')} onclick={restoreBackup} data-testid="onboarding-welcome__restore-backup" />
          <MenuItem label={t('Add as Second Device')} onclick={addAsSecondDevice} data-testid="onboarding-welcome__add-second-device" />
        </div>
      {/if}
    </div>

    <button
      type="button"
      class="proxy-link"
      onclick={() => (proxyOpen = true)}
      data-testid="onboarding-welcome__proxy"
    >
      <Icon name={pendingProxy.url ? 'shield-fill' : 'shield'} size={14} />
      {#if pendingProxy.url}
        <span data-testid="onboarding-welcome__proxy-host">{t('Via proxy: {host}', { host: proxyHost })}</span>
      {:else}
        <span>{t('Connection settings')}</span>
      {/if}
    </button>
  </div>
</main>

<ProxyDialog open={proxyOpen} onClose={() => (proxyOpen = false)} />

<style>
  .welcome {
    height: 100vh;
    width: 100vw;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: calc(8vh + var(--titlebar-gutter)) var(--space-5) 6vh;
    background: var(--color-bg);
  }
  .brand {
    text-align: center;
    margin-top: 6vh;
  }
  .logo-wrap {
    line-height: 0;
    display: flex;
    justify-content: center;
  }
  .wordmark {
    margin-top: var(--space-3);
    font-size: clamp(28px, 6vw, 44px);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
    color: var(--color-fg);
  }
  .tagline {
    margin-top: var(--space-3);
    color: var(--color-fg-secondary);
    font-size: var(--text-lg);
  }

  .actions {
    width: 100%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .alt {
    position: relative;
  }
  .alt-menu {
    position: absolute;
    bottom: calc(100% + var(--space-2));
    left: 0;
    right: 0;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px var(--color-shadow);
    padding: 4px;
    display: flex;
    flex-direction: column;
  }
  .proxy-link {
    background: transparent;
    border: 0;
    padding: var(--space-2);
    margin: var(--space-2) auto 0;
    color: var(--color-fg-secondary);
    font-size: var(--text-xs);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: var(--radius-sm);
  }
  .proxy-link:hover {
    color: var(--color-fg);
    background: var(--color-bg-hover);
  }
</style>
