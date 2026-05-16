<script lang="ts">
  import type { Message } from '../../lib/state/chat.svelte';
  import { rpc } from '../../lib/rpc';
  import { accounts } from '../../lib/state/accounts.svelte';
  import { selectChat } from '../../lib/state/selection.svelte';
  import ConfirmDialog from '../../lib/ConfirmDialog.svelte';
  import { t } from '../../lib/i18n/i18n.svelte';

  type Props = {
    message: Message;
    /** Tile colour triple — see MessageBubble. `bg` is the bubble fill
     *  behind the tile (also the puck-icon colour), `accent` fills the puck. */
    bg: string;
    fg: string;
    accent: string;
  };

  let { message, bg, fg, accent }: Props = $props();

  type VcardContact = {
    addr: string;
    authname: string;
    key?: string;
    profileImage?: string | null;
    biography?: string | null;
    displayName?: string;
    timestamp?: number;
  };

  let vc = $derived(message.vcardContact as VcardContact | null);
  let errorMsg = $state<string | null>(null);

  async function openChat() {
    if (!vc || accounts.selectedId == null) return;
    try {
      const contactId = await rpc.call<number>('create_contact', [
        accounts.selectedId,
        vc.addr,
        vc.authname || vc.displayName || '',
      ]);
      const chatId = await rpc.call<number>('create_chat_by_contact_id', [
        accounts.selectedId,
        contactId,
      ]);
      selectChat(chatId);
    } catch (err) {
      errorMsg = `${t('Could not open chat')}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  let label = $derived(vc?.displayName || vc?.authname || vc?.addr || t('Contact'));
  let initial = $derived(label[0]?.toUpperCase() ?? '?');
</script>

<div class="vcard" style:--cell-bg={bg} style:--cell-fg={fg} style:--cell-accent={accent}>
  <span class="avatar" aria-hidden="true">{initial}</span>
  <span class="meta">
    <span class="name">{label}</span>
    {#if vc?.addr}
      <span class="addr">{vc.addr}</span>
    {/if}
  </span>
  {#if vc?.addr}
    <button class="open" onclick={openChat}>{t('Open chat')}</button>
  {/if}
</div>
{#if message.text}
  <div class="caption">{message.text}</div>
{/if}

<ConfirmDialog
  open={errorMsg != null}
  mode="alert"
  title={errorMsg ?? ''}
  onClose={() => (errorMsg = null)}
/>

<style>
  .vcard {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--cell-fg);
    max-width: 320px;
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--cell-accent);
    color: var(--cell-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    flex: 0 0 auto;
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .addr {
    font-size: var(--text-xs);
    color: color-mix(in srgb, var(--cell-fg) 58%, transparent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .open {
    padding: 5px 10px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--cell-accent);
    color: var(--cell-bg);
    font-size: var(--text-xs);
    font-weight: 600;
    flex: 0 0 auto;
    cursor: pointer;
    transition: filter 0.1s ease;
  }
  .open:hover {
    filter: brightness(1.08);
  }
  .caption {
    margin-top: 6px;
    white-space: pre-wrap;
  }
</style>
