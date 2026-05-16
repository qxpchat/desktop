<script lang="ts">
  // App-level forward flow. Mirrors Delta Chat's safety UX: pick a target
  // chat → that chat is *opened* → a confirm dialog names it → only then
  // does the message move. Self-chat skips the confirm (no wrong-recipient
  // risk). Lives above ChatView so the queued ids survive the chat switch.
  import ChatPicker from '../chat/ChatPicker.svelte';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import { forwardState } from '../lib/state/forward.svelte';
  import { forwardMessages } from '../lib/state/chat.svelte';
  import { chatlist } from '../lib/state/chatlist.svelte';
  import { selection, selectChat } from '../lib/state/selection.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  // Target picked + chat opened, awaiting confirmation. `origin` is the
  // chat to fall back to if the user declines.
  let pending = $state<{ chatId: number; chatName: string; origin: number | null } | null>(null);
  let confirmed = false;
  let errorMsg = $state<string | null>(null);

  let pickerOpen = $derived(forwardState.messageIds != null && pending == null);

  async function runForward(targetChatId: number, ids: number[]) {
    try {
      await forwardMessages(ids, targetChatId);
    } catch (err) {
      errorMsg = `${t('Forward failed')}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  function onPick(targetChatId: number) {
    const ids = forwardState.messageIds;
    if (ids == null) return;
    const item = chatlist.items.get(targetChatId);
    const origin = selection.chatId;
    // Open the target chat so the user sees exactly where the message lands.
    selectChat(targetChatId);
    if (item?.isSelfTalk) {
      // Saved-messages forward — no recipient to get wrong, skip the confirm.
      void runForward(targetChatId, ids);
      forwardState.messageIds = null;
    } else {
      pending = { chatId: targetChatId, chatName: item?.name ?? '', origin };
    }
  }

  function closePicker() {
    forwardState.messageIds = null;
  }

  function onConfirm() {
    confirmed = true;
    const ids = forwardState.messageIds;
    if (pending != null && ids != null) void runForward(pending.chatId, ids);
  }

  // Fires for both confirm-then-close and a bare cancel/dismiss. On a bare
  // cancel, hop back to the chat the message came from.
  function onDialogClose() {
    if (!confirmed && pending?.origin != null) selectChat(pending.origin);
    confirmed = false;
    pending = null;
    forwardState.messageIds = null;
  }
</script>

<ChatPicker open={pickerOpen} onPick={onPick} onClose={closePicker} />

<ConfirmDialog
  open={pending != null}
  title={t('Forward to {name}?', { name: pending?.chatName ?? '' })}
  confirmLabel={t('Forward')}
  onConfirm={onConfirm}
  onClose={onDialogClose}
/>

<ConfirmDialog
  open={errorMsg != null}
  mode="alert"
  title={errorMsg ?? ''}
  onClose={() => (errorMsg = null)}
/>
