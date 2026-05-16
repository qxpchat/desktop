<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fullMessage, closeFullMessage } from '../lib/state/fullMessage.svelte';
  import { t } from '../lib/i18n/i18n.svelte';
  import IconButton from '../lib/IconButton.svelte';

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && fullMessage.open) closeFullMessage();
  }

  onMount(() => {
    window.addEventListener('keydown', onKey);
  });
  onDestroy(() => {
    window.removeEventListener('keydown', onKey);
  });
</script>

{#if fullMessage.open}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label={t('Full message')}
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeFullMessage();
    }}
    onkeydown={(e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
        e.preventDefault();
        closeFullMessage();
      }
    }}
  >
    <div class="panel">
      <header>
        <span class="title" title={fullMessage.subject}>
          {fullMessage.subject || t('Full message')}
        </span>
        <IconButton icon="x" label={t('Close')} onclick={closeFullMessage} />
      </header>

      {#if fullMessage.loading}
        <div class="state">{t('Loading…')}</div>
      {:else if fullMessage.error}
        <div class="state error">{fullMessage.error}</div>
      {:else}
        <!-- The body is untrusted message content. `sandbox=""` is the most
             restrictive setting: a null origin with scripts, forms, and
             top-level navigation all disabled — no XSS surface. `allow-popups`
             only lets explicit-target links open a new tab. -->
        <iframe
          class="body"
          title={fullMessage.subject || t('Full message')}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcdoc={fullMessage.html ?? ''}
        ></iframe>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    z-index: var(--z-modal);
  }
  .panel {
    display: flex;
    flex-direction: column;
    width: min(720px, 100%);
    height: min(80vh, 100%);
    background: var(--color-bg);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
  .title {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    font-size: var(--text-md);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .state.error {
    color: var(--color-danger);
  }
  .body {
    flex: 1;
    border: 0;
    width: 100%;
    /* Matches the background injected into the message document — avoids a
       white flash before the iframe paints. */
    background: var(--color-bg);
  }
</style>
