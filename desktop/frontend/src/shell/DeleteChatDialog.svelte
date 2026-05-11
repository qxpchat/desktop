<script lang="ts">
  // Modal confirmation for chat-row deletion. Mirrors the iOS / deltachat-
  // desktop UX: a single danger button whose label switches to
  // "Leave & Delete for Me" for encrypted groups the user is still in
  // (those need a `leave_group` before the local delete).
  //
  // We use this instead of the native `window.confirm()` so the prompt
  // renders inside the Tauri webview consistently across platforms and
  // matches the rest of the app's modal styling (see DeleteMessageDialog).

  import { onMount, onDestroy } from 'svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    open: boolean;
    chatName: string;
    /** When true, swap the confirm-button label and let the parent run
     *  `leave_group` before `delete_chat`. */
    leaveBeforeDelete: boolean;
    onConfirm: () => void;
    onClose: () => void;
  };

  let { open, chatName, leaveBeforeDelete, onConfirm, onClose }: Props = $props();

  let confirmLabel = $derived(
    leaveBeforeDelete ? t('Leave & Delete for Me') : t('Delete for Me'),
  );

  function confirm() {
    onConfirm();
    onClose();
  }

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
    aria-labelledby="delete-chat-dialog-title"
    aria-describedby="delete-chat-dialog-body"
  >
    <h2 id="delete-chat-dialog-title">{t('Delete chat?')}</h2>
    <p id="delete-chat-dialog-body">
      {chatName || t('(no name)')}
      <br />
      <span class="hint">{t('All messages in this chat will be deleted locally.')}</span>
    </p>
    <div class="actions">
      <button class="btn danger" onclick={confirm}>
        {confirmLabel}
      </button>
      <!-- svelte-ignore a11y_autofocus -->
      <button class="btn" onclick={onClose} autofocus>
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
    color: var(--color-fg);
    font-size: var(--text-sm);
  }
  .hint {
    color: var(--color-fg-secondary);
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
