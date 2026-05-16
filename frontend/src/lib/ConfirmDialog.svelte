<script lang="ts" module>
  export type Props = {
    open: boolean;
    title: string;
    /** Optional secondary line below the title. */
    message?: string;
    /** `confirm` shows confirm + cancel; `alert` shows a single dismiss
     *  button (replaces native `alert()`). */
    mode?: 'confirm' | 'alert';
    confirmLabel?: string;
    cancelLabel?: string;
    /** Destructive action — confirm button reads red. */
    danger?: boolean;
    /** Run on confirm. The dialog closes itself afterwards. */
    onConfirm?: () => void;
    onClose: () => void;
    /** Forwarded to the Modal for E2E selectors. */
    'data-testid'?: string;
  };
</script>

<script lang="ts">
  // Modal-based replacement for the webview's native `confirm()` / `alert()`,
  // which render unstyled OS chrome inside the Tauri window. Same card +
  // stacked-action layout as DeleteChatDialog.
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import { t } from './i18n/i18n.svelte';

  let {
    open,
    title,
    message,
    mode = 'confirm',
    confirmLabel,
    cancelLabel,
    danger = false,
    onConfirm,
    onClose,
    ...rest
  }: Props = $props();

  function confirm() {
    onConfirm?.();
    onClose();
  }
</script>

<Modal {open} {onClose} size="sm" role="alertdialog" ariaLabel={title} {...rest}>
  <div class="content">
    <h2>{title}</h2>
    {#if message}<p>{message}</p>{/if}
    <div class="actions">
      <Button
        variant={danger ? 'danger-text' : 'primary'}
        onclick={confirm}
        data-testid="confirm-dialog__confirm"
      >
        {confirmLabel ?? (mode === 'alert' ? t('OK') : t('Confirm'))}
      </Button>
      {#if mode === 'confirm'}
        <Button variant="secondary" onclick={onClose} data-testid="confirm-dialog__cancel">
          {cancelLabel ?? t('Cancel')}
        </Button>
      {/if}
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
