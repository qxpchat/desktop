<script lang="ts">
  // Shown in place of the Composer when the active chat is a contact
  // request (`Blocked::Request`). deltachat-core refuses every send to such
  // a chat, so the user must Accept (clears the request → composer returns)
  // or decline before they can reply. Mirrors deltachat-desktop's
  // contact-request bar in `composer/Composer.tsx`.
  import { acceptChat, blockChat } from '../lib/state/chat.svelte';
  import { selectChat } from '../lib/state/selection.svelte';
  import Button from '../lib/Button.svelte';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    /** Chat name — shown in the delete confirmation for group requests. */
    chatName: string;
    /** 1:1 requests are blocked outright; group/broadcast invites are
     *  deleted and ask for confirmation first. */
    isSingle: boolean;
  };
  let { chatName, isSingle }: Props = $props();

  let busy = $state(false);
  let confirmOpen = $state(false);

  async function accept() {
    busy = true;
    try {
      await acceptChat();
    } finally {
      busy = false;
    }
  }

  async function decline() {
    busy = true;
    try {
      await blockChat();
      // The chat is gone from the list now — leave the chat view.
      selectChat(null);
    } finally {
      busy = false;
    }
  }

  function onDeclineClick() {
    if (isSingle) void decline();
    else confirmOpen = true;
  }
</script>

<div class="contact-request" data-testid="contact-request-bar">
  <p class="hint">{t('Accept this contact to reply.')}</p>
  <div class="actions">
    <Button
      variant="secondary"
      disabled={busy}
      onclick={onDeclineClick}
      data-testid="contact-request-bar__decline"
    >
      {isSingle ? t('Block') : t('Delete')}
    </Button>
    <Button
      variant="primary"
      disabled={busy}
      onclick={accept}
      data-testid="contact-request-bar__accept"
    >
      {t('Accept')}
    </Button>
  </div>
</div>

<ConfirmDialog
  open={confirmOpen}
  title={t('Delete "{name}"?', { name: chatName })}
  message={t('This invite will be removed.')}
  confirmLabel={t('Delete')}
  danger
  onConfirm={() => void decline()}
  onClose={() => (confirmOpen = false)}
/>

<style>
  .contact-request {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-elevated);
    border-top: 1px solid var(--color-border);
  }
  .hint {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .actions {
    display: flex;
    gap: var(--space-2);
    flex: 0 0 auto;
  }
</style>
