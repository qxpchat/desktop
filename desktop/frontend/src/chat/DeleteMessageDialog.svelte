<script lang="ts">
  // Mirrors the iOS delete confirmation: when the user owns the message and
  // it has already been sent, offer "Delete for Everyone" alongside
  // "Delete for Me". For messages from other contacts, only the local
  // delete is available (core would refuse a recall anyway).

  import Modal from '../lib/Modal.svelte';
  import Button from '../lib/Button.svelte';
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
</script>

<Modal
  {open}
  {onClose}
  size="sm"
  role="alertdialog"
  ariaLabelledBy="delete-dialog-title"
  ariaDescribedBy="delete-dialog-body"
  data-testid="delete-msg-dialog"
>
  <div class="content">
    <h2 id="delete-dialog-title">
      {count > 1 ? t('Delete Messages') : t('Delete Message')}
    </h2>
    <p id="delete-dialog-body">
      {count > 1 ? t('Delete {n} messages?', { n: count }) : t('Delete this message?')}
    </p>
    <div class="actions">
      {#if canDeleteForAll}
        <Button variant="danger-text" onclick={deleteForAll} data-testid="delete-msg-dialog__delete-for-all">
          {t('Delete for Everyone')}
        </Button>
      {/if}
      <Button variant="danger-text" onclick={deleteForMe} data-testid="delete-msg-dialog__delete-for-me">
        {t('Delete for Me')}
      </Button>
      <!-- svelte-ignore a11y_autofocus -->
      <Button variant="secondary" onclick={onClose} autofocus data-testid="delete-msg-dialog__cancel">
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
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: var(--space-2);
  }
</style>
