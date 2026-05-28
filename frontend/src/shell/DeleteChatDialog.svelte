<script lang="ts">
  // Modal confirmation for chat-row deletion. Mirrors the iOS / deltachat-
  // desktop UX: a single danger button whose label switches to
  // "Leave & Delete for Me" for encrypted groups the user is still in
  // (those need a `leave_group` before the local delete).

  import Modal from '../lib/Modal.svelte';
  import Button from '../lib/Button.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    open: boolean;
    chatName: string;
    /** When true, swap the confirm-button label and let the parent run
     *  `leave_group` before `delete_chat`. */
    leaveBeforeDelete: boolean;
    /** Number of chats being deleted. >1 switches to a batch message and
     *  ignores `chatName` / `leaveBeforeDelete` (leave is handled per-chat
     *  by the parent loop). */
    count?: number;
    onConfirm: () => void;
    onClose: () => void;
  };

  let { open, chatName, leaveBeforeDelete, count = 1, onConfirm, onClose }: Props = $props();

  let multi = $derived(count > 1);
  let confirmLabel = $derived(
    multi
      ? t('Delete {n} chats', { n: count })
      : leaveBeforeDelete
        ? t('Leave & Delete for Me')
        : t('Delete for Me'),
  );

  function confirm() {
    onConfirm();
    onClose();
  }
</script>

<Modal
  {open}
  {onClose}
  size="sm"
  role="alertdialog"
  ariaLabelledBy="delete-chat-dialog-title"
  ariaDescribedBy="delete-chat-dialog-body"
  data-testid="delete-chat-dialog"
>
  <div class="content">
    <h2 id="delete-chat-dialog-title">{multi ? t('Delete {n} chats?', { n: count }) : t('Delete chat?')}</h2>
    <p id="delete-chat-dialog-body">
      {#if !multi}
        {chatName || t('(no name)')}
        <br />
      {/if}
      <span class="hint">{t('All messages in this chat will be deleted locally.')}</span>
    </p>
    <div class="actions">
      <Button variant="danger-text" onclick={confirm} data-testid="delete-chat-dialog__confirm">
        {confirmLabel}
      </Button>
      <!-- svelte-ignore a11y_autofocus -->
      <Button variant="secondary" onclick={onClose} autofocus data-testid="delete-chat-dialog__cancel">
        {t('Cancel')}
      </Button>
    </div>
  </div>
</Modal>

<style>
  .content {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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
    margin-top: var(--space-2);
  }
</style>
