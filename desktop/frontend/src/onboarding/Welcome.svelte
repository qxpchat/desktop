<script lang="ts">
  import Logo from '../lib/Logo.svelte';

  type Props = {
    onSignUp: () => void;
    onManualSetup: () => void;
    onRestoreBackup: () => void;
    onAddAsSecondDevice: () => void;
  };

  let { onSignUp, onManualSetup, onRestoreBackup, onAddAsSecondDevice }: Props = $props();

  let altMenuOpen = $state(false);

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

  function toggleAlt() {
    altMenuOpen = !altMenuOpen;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') altMenuOpen = false;
  }
</script>

<svelte:window onkeydown={onKey} />

<main class="welcome">
  <div class="brand">
    <div class="logo-wrap">
      <Logo size="clamp(96px, 22vw, 168px)" />
    </div>
    <div class="wordmark">qxp</div>
    <p class="tagline">Chat over Email</p>
  </div>

  <div class="actions">
    <button class="primary" onclick={signUp}>Sign Up</button>

    <div class="alt">
      <button class="secondary" aria-haspopup="menu" aria-expanded={altMenuOpen} onclick={toggleAlt}>
        I Already Have a Profile
      </button>

      {#if altMenuOpen}
        <div class="alt-menu" role="menu">
          <button role="menuitem" onclick={manualSetup}>Manual Setup</button>
          <button role="menuitem" onclick={restoreBackup}>Restore Backup</button>
          <button role="menuitem" onclick={addAsSecondDevice}>Add as Second Device</button>
        </div>
      {/if}
    </div>
  </div>
</main>

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
    color: var(--color-accent);
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
  .primary,
  .secondary {
    width: 100%;
    height: 48px;
    border-radius: var(--radius-md);
    font-size: var(--text-md);
    font-weight: 600;
    justify-content: center;
    transition:
      background 0.12s,
      transform 0.05s;
  }
  .primary {
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .primary:hover {
    filter: brightness(1.05);
  }
  .primary:active {
    transform: scale(0.98);
  }
  .secondary {
    background: transparent;
    color: var(--color-accent);
  }
  .secondary:hover {
    background: var(--color-bg-hover);
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
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .alt-menu button {
    padding: var(--space-3) var(--space-4);
    justify-content: flex-start;
    color: var(--color-fg);
    font-size: var(--text-md);
  }
  .alt-menu button:hover {
    background: var(--color-bg-hover);
  }
  .alt-menu button + button {
    border-top: 1px solid var(--color-border);
  }
</style>
