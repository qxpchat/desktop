<script lang="ts">
  import { onboarding, cancelOnboarding, resetOnboarding } from '../lib/state/onboarding.svelte';

  let phase = $derived(onboarding.phase);

  let label = $derived.by(() => {
    switch (phase.kind) {
      case 'configuring':
        return 'Configuring…';
      case 'importing':
        return 'Importing backup…';
      case 'receiving':
        return 'Transferring…';
      case 'failed':
        return 'Could not connect';
      default:
        return '';
    }
  });

  let progress = $derived(
    phase.kind === 'configuring' || phase.kind === 'importing' || phase.kind === 'receiving'
      ? phase.progress
      : 0,
  );
</script>

{#if phase.kind === 'failed'}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="card">
      <h2>{label}</h2>
      <p class="error">{phase.message}</p>
      <div class="actions">
        <button class="primary" onclick={resetOnboarding}>OK</button>
      </div>
    </div>
  </div>
{:else if phase.kind !== 'idle'}
  <div class="overlay" role="dialog" aria-modal="true" aria-label={label}>
    <div class="card">
      <h2>{label}</h2>
      <div class="progress-row">
        <progress value={progress} max="1000"></progress>
        <span class="permille">{Math.round((progress / 1000) * 100)}%</span>
      </div>
      <p class="hint">Keep this tab open until configuration completes.</p>
      <div class="actions">
        <button class="cancel" onclick={cancelOnboarding}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    backdrop-filter: blur(4px);
  }
  .card {
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    width: min(420px, calc(100vw - 2 * var(--space-4)));
    box-shadow: 0 16px 48px var(--color-shadow);
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
  .actions button {
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: var(--text-md);
  }
  .primary {
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .primary:hover {
    filter: brightness(1.05);
  }
  .cancel {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .cancel:hover {
    background: var(--color-border);
  }
</style>
