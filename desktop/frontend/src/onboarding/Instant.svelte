<script lang="ts">
  import { onboarding, createInstantAccount } from '../lib/state/onboarding.svelte';
  import ProgressOverlay from './ProgressOverlay.svelte';
  import Button from '../lib/Button.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onBack: () => void;
    onManual: () => void;
  };

  let { onBack, onManual }: Props = $props();

  let displayName = $state('');
  let altMenuOpen = $state(false);

  // Step 2 ships the default chatmail provider only. Custom-provider QR scan
  // is wired up in step 4 alongside the backup-pair scanner.
  const provider = 'nine.testrun.org';

  let trimmedName = $derived(displayName.trim());
  let canCreate = $derived(trimmedName.length > 0 && onboarding.phase.kind === 'idle');
  let avatarLetter = $derived(trimmedName[0]?.toUpperCase() ?? '?');

  async function create() {
    try {
      await createInstantAccount(trimmedName);
    } catch {
      /* error already surfaced via onboarding.phase = failed */
    }
  }
</script>

<header class="topbar" data-tauri-drag-region>
  <button class="back" onclick={onBack} aria-label={t('Back')}>‹ {t('Back')}</button>
</header>

<main class="instant" data-testid="onboarding-instant">
  <div class="avatar" aria-hidden="true">{avatarLetter}</div>

  <input
    class="name"
    type="text"
    placeholder={t('Your name')}
    bind:value={displayName}
    autocomplete="nickname"
    data-testid="onboarding-instant__name"
  />

  <p class="hint">{t('Set a name so others recognize you.')}</p>

  <p class="privacy">
    {t('By creating a profile, you agree to the')}
    <a href={`https://${provider}/privacy.html`} target="_blank" rel="noopener noreferrer">
      {t('privacy policy of {provider}', { provider })}
    </a>.
  </p>

  <Button variant="primary" size="lg" block disabled={!canCreate} onclick={create} data-testid="onboarding-instant__submit">{t('Create Profile')}</Button>

  <div class="alt">
    <Button variant="accent-text" size="lg" block aria-haspopup="menu" aria-expanded={altMenuOpen} onclick={() => (altMenuOpen = !altMenuOpen)}>
      {t('Use Other Server')}
    </Button>

    {#if altMenuOpen}
      <div class="alt-menu" role="menu">
        <a href="https://chatmail.at/relays" target="_blank" rel="noopener noreferrer" role="menuitem">
          {t('Other Servers (web ↗)')}
        </a>
        <button
          role="menuitem"
          onclick={() => {
            altMenuOpen = false;
            onManual();
          }}
        >
          {t('Manual Setup')}
        </button>
      </div>
    {/if}
  </div>
</main>

<ProgressOverlay />

<style>
  .topbar {
    padding: calc(var(--titlebar-gutter)) var(--space-3) 0;
    display: flex;
    align-items: center;
    min-height: 48px;
    background: var(--color-bg);
  }
  .back {
    color: var(--color-accent);
    font-size: var(--text-md);
    padding: var(--space-2) var(--space-2);
  }
  .instant {
    min-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-6) var(--space-5);
    max-width: 420px;
    margin: 0 auto;
    gap: var(--space-3);
  }
  .avatar {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 44px;
    font-weight: 600;
    margin-bottom: var(--space-3);
  }
  .name {
    width: 100%;
    height: 44px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg-pane);
    font-size: var(--text-lg);
    text-align: center;
  }
  .name:focus {
    outline: none;
  }
  .hint {
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
    margin: 0;
    text-align: center;
  }
  .privacy {
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
    text-align: center;
    margin: var(--space-2) 0;
  }
  .privacy a {
    color: var(--color-accent);
    text-decoration: none;
  }
  .privacy a:hover {
    text-decoration: underline;
  }
  .alt {
    width: 100%;
    position: relative;
  }
  .alt-menu {
    position: absolute;
    top: calc(100% + var(--space-2));
    left: 0;
    right: 0;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px var(--color-shadow);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .alt-menu > * {
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-md);
    color: var(--color-fg);
    text-align: left;
    text-decoration: none;
    display: block;
    background: transparent;
  }
  .alt-menu > *:hover {
    background: var(--color-bg-hover);
  }
  .alt-menu > * + * {
    border-top: 1px solid var(--color-border);
  }
</style>
