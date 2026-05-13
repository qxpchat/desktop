<script lang="ts">
  // Mirrors the iOS delete confirmation: when the user owns the message and
  // it has already been sent, offer "Delete for Everyone" alongside
  // "Delete for Me". For messages from other contacts, only the local
  // delete is available (core would refuse a recall anyway).

  import { onMount, onDestroy } from 'svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    open: boolean;
    /** Show the "Delete for Everyone" button. */
    canDeleteForAll: boolean;
    /** Number of messages being deleted (drives the dialog body's pluralisation). */
    count?: number;
    onDeleteForMe: () => void;
    onDeleteForAll: () => void;
    onClose: () => void;
  };

  let { open, canDeleteForAll, count = 1, onDeleteForMe, onDeleteForAll, onClose }: Props = $props();

  function deleteForMe() {
    onDeleteForMe();
    onClose();
  }
  function deleteForAll() {
    onDeleteForAll();
    onClose();
  }

  // Window-level Escape so the dialog can be dismissed without first
  // focusing into the card. Only attached while open to avoid stealing
  // Escape from other surfaces.
  function onWindowKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }
  onMount(() => window.addEventListener('keydown', onWindowKey));
  onDestroy(() => window.removeEventListener('keydown', onWindowKey));
</script>

{#if open}
  <button class="backdrop" onclick={onClose} aria-label={t('Cancel')}></button>
  <div
    class="card"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="delete-dialog-title"
    aria-describedby="delete-dialog-body"
    data-testid="delete-msg-dialog"
  >
    <h2 id="delete-dialog-title">
      {count > 1 ? t('Delete Messages') : t('Delete Message')}
    </h2>
    <p id="delete-dialog-body">
      {count > 1 ? t('Delete {n} messages?', { n: count }) : t('Delete this message?')}
    </p>
    <div class="actions">
      {#if canDeleteForAll}
        <button class="btn danger" onclick={deleteForAll} data-testid="delete-msg-dialog__delete-for-all">
          {t('Delete for Everyone')}
        </button>
      {/if}
      <button class="btn danger" onclick={deleteForMe} data-testid="delete-msg-dialog__delete-for-me">
        {t('Delete for Me')}
      </button>
      <!-- svelte-ignore a11y_autofocus -->
      <button class="btn" onclick={onClose} autofocus data-testid="delete-msg-dialog__cancel">
        {t('Cancel')}
      </button>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: var(--z-modal);
    border: 0;
  }
  .card {
    position: fixed;
    z-index: calc(var(--z-modal) + 1);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(360px, calc(100vw - 24px));
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 16px 48px var(--color-shadow);
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
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }
  .btn {
    height: 36px;
    border-radius: var(--radius-md);
    background: var(--color-bg-hover);
    color: var(--color-fg);
    font-size: var(--text-md);
    font-weight: 500;
    border: 0;
    cursor: pointer;
  }
  .btn:hover {
    background: var(--color-border);
  }
  .btn.danger {
    color: var(--color-danger);
  }
</style>
