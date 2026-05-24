<script lang="ts">
  import { onboarding, cancelOnboarding, resetOnboarding } from '../lib/state/onboarding.svelte';
  import Modal from '../lib/Modal.svelte';
  import Button from '../lib/Button.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  let phase = $derived(onboarding.phase);

  let label = $derived.by(() => {
    switch (phase.kind) {
      case 'configuring':
        return t('Configuring…');
      case 'importing':
        return t('Importing backup…');
      case 'receiving':
        // No progress yet means the two devices haven't linked up — the
        // transfer proper only starts once `progress` moves off zero.
        return phase.progress === 0 ? t('Connecting…') : t('Transferring…');
      case 'failed':
        return t('Could not connect');
      default:
        return '';
    }
  });

  // A device-pairing transfer stuck at 0% is almost always a network-reach
  // problem. Surface a hint after a few seconds so the user isn't left
  // staring at a frozen bar.
  let slowHint = $state(false);
  $effect(() => {
    if (phase.kind !== 'receiving' || phase.progress !== 0) {
      slowHint = false;
      return;
    }
    const timer = setTimeout(() => (slowHint = true), 4000);
    return () => clearTimeout(timer);
  });

  let progress = $derived(
    phase.kind === 'configuring' || phase.kind === 'importing' || phase.kind === 'receiving'
      ? phase.progress
      : 0,
  );

  // The Modal's `onClose` (backdrop click / Escape) must do the right thing
  // per phase: in `failed` it dismisses + resets; in any in-flight phase the
  // user has to explicitly hit Cancel, so the close handler is a no-op
  // (effectively makes the in-flight overlay non-dismissable).
  function onClose() {
    if (phase.kind === 'failed') resetOnboarding();
  }
</script>

<Modal open={phase.kind !== 'idle'} {onClose} size="md" ariaLabel={label} data-testid="onboarding-progress">
  <div class="content" data-phase={phase.kind}>
    <h2>{label}</h2>
    {#if phase.kind === 'failed'}
      <p class="error" data-testid="onboarding-progress__error">{phase.message}</p>
      <div class="actions">
        <Button variant="primary" onclick={resetOnboarding}>{t('OK')}</Button>
      </div>
    {:else}
      <div class="progress-row">
        <progress value={progress} max="1000"></progress>
        <span class="permille">{Math.round((progress / 1000) * 100)}%</span>
      </div>
      <p class="hint">{t('Keep this tab open until configuration completes.')}</p>
      {#if slowHint}
        <p class="hint slow">
          {t('Still connecting. Make sure both devices are on the same network, then try again.')}
        </p>
      {/if}
      <div class="actions">
        <Button variant="secondary" onclick={cancelOnboarding} data-testid="onboarding-progress__cancel">{t('Cancel')}</Button>
      </div>
    {/if}
  </div>
</Modal>

<style>
  .content {
    padding: var(--space-5);
  }
  h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .progress-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  progress {
    flex: 1;
    height: 8px;
    appearance: none;
    -webkit-appearance: none;
    border: 0;
    border-radius: 4px;
    overflow: hidden;
    background: var(--color-bg-hover);
  }
  progress::-webkit-progress-bar {
    background: var(--color-bg-hover);
    border-radius: 4px;
  }
  progress::-webkit-progress-value {
    background: var(--color-accent);
    border-radius: 4px;
    transition: width 0.2s ease;
  }
  progress::-moz-progress-bar {
    background: var(--color-accent);
    border-radius: 4px;
  }
  .permille {
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
    font-variant-numeric: tabular-nums;
    min-width: 3.5em;
    text-align: right;
  }
  .hint {
    margin: var(--space-3) 0 0;
    color: var(--color-fg-tertiary);
    font-size: var(--text-sm);
  }
  .hint.slow {
    color: var(--color-fg-secondary);
  }
  .error {
    color: var(--color-danger);
    font-size: var(--text-md);
    margin: 0 0 var(--space-3);
    word-break: break-word;
  }
  .actions {
    margin-top: var(--space-4);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
