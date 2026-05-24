<script lang="ts">
  import { onboarding, createInstantAccount, DEFAULT_RELAY } from '../lib/state/onboarding.svelte';
  import ProgressOverlay from './ProgressOverlay.svelte';
  import Button from '../lib/Button.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import TextInput from '../lib/TextInput.svelte';
  import MenuItem from '../lib/MenuItem.svelte';
  import AvatarEditor from '../lib/AvatarEditor.svelte';
  import { uploadBlob } from '../lib/files';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onBack: () => void;
    onManual: () => void;
  };

  let { onBack, onManual }: Props = $props();

  let displayName = $state('');
  let altMenuOpen = $state(false);
  // Path returned by `uploadBlob` after the user picks + crops an avatar.
  // Threaded into `createInstantAccount` as `selfavatar`. `null` = no
  // avatar picked (skip the `set_config('selfavatar')` call).
  let avatarPath = $state<string | null>(null);
  // Brand-default color for the initials fallback before any account
  // exists. Same teal the rest of the app uses.
  const DEFAULT_COLOR = '#22ccaa';

  // Step 2 ships the default chatmail relay only. Custom-provider QR scan
  // is wired up in step 4 alongside the backup-pair scanner.
  const provider = DEFAULT_RELAY;

  let trimmedName = $derived(displayName.trim());
  let canCreate = $derived(trimmedName.length > 0 && onboarding.phase.kind === 'idle');

  async function create() {
    try {
      await createInstantAccount(trimmedName, undefined, avatarPath);
    } catch {
      /* error already surfaced via onboarding.phase = failed */
    }
  }

  /** AvatarEditor `onChange`: `blob` = picked + cropped; `null` = remove. */
  async function onAvatarChange(blob: Blob | null) {
    if (!blob) {
      avatarPath = null;
      return;
    }
    try {
      avatarPath = await uploadBlob(blob, 'png');
    } catch {
      /* keep current avatar — uploadBlob already logged */
    }
  }

  // Escape closes the alternate-server menu.
  $effect(() => {
    if (!altMenuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        altMenuOpen = false;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<header class="topbar" data-tauri-drag-region>
  <BackButton label={t('Back')} onclick={onBack} />
</header>

<main class="instant" data-testid="onboarding-instant">
  <AvatarEditor
    name={trimmedName}
    color={DEFAULT_COLOR}
    imagePath={avatarPath}
    size={100}
    onChange={onAvatarChange}
    data-testid="onboarding-instant__avatar"
  />

  <div class="name-field">
    <TextInput
      align="center"
      placeholder={t('Your name')}
      bind:value={displayName}
      autocomplete="nickname"
      data-testid="onboarding-instant__name"
    />
  </div>

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
        <a class="alt-link" href="https://chatmail.at/relays" target="_blank" rel="noopener noreferrer" role="menuitem">
          {t('Other Servers (web ↗)')}
        </a>
        <MenuItem
          label={t('Manual Setup')}
          onclick={() => {
            altMenuOpen = false;
            onManual();
          }}
        />
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
  /* Match the previous bottom-spacing the inline avatar button used —
     the rest of the form keeps its `gap: var(--space-3)` rhythm. */
  main.instant > :global(button[data-testid="onboarding-instant__avatar"]) {
    margin-bottom: var(--space-3);
  }
  .name-field {
    width: 100%;
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
    padding: 4px;
    display: flex;
    flex-direction: column;
  }
  /* External-link menu row — styled to match the MenuItem sibling. */
  .alt-link {
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    color: var(--color-fg);
    text-decoration: none;
    transition: background 0.1s ease;
  }
  .alt-link:hover {
    background: var(--color-bg-hover);
  }
</style>
