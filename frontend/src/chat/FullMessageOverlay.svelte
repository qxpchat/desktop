<script lang="ts">
  import Overlay from '../lib/Overlay.svelte';
  import { fullMessage, closeFullMessage } from '../lib/state/fullMessage.svelte';
  import { t } from '../lib/i18n/i18n.svelte';
  import IconButton from '../lib/IconButton.svelte';
</script>

<Overlay
  open={fullMessage.open}
  onClose={closeFullMessage}
  ariaLabel={t('Full message')}
  backdrop="rgba(0, 0, 0, 0.6)"
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
      <!-- The body is untrusted message content. `sandbox` without
           `allow-scripts` / `allow-same-origin` gives a null origin with
           scripts, forms, and top-level navigation disabled — no XSS
           surface. `allow-popups` only lets explicit-target links open. -->
      <iframe
        class="body"
        title={fullMessage.subject || t('Full message')}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcdoc={fullMessage.html ?? ''}
      ></iframe>
    {/if}
  </div>
</Overlay>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    width: min(720px, calc(100vw - 64px));
    height: min(80vh, calc(100vh - 64px));
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
