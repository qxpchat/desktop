<script lang="ts">
  import type { Message } from '../../lib/state/chat.svelte';
  import { rpc } from '../../lib/rpc';
  import { accounts } from '../../lib/state/accounts.svelte';
  import { selectChat } from '../../lib/state/selection.svelte';
  import { t } from '../../lib/i18n/i18n.svelte';

  type Props = {
    message: Message;
  };

  let { message }: Props = $props();

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
      alert(`${t('Could not open chat')}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let label = $derived(vc?.displayName || vc?.authname || vc?.addr || t('Contact'));
  let initial = $derived(label[0]?.toUpperCase() ?? '?');
</script>

<div class="vcard">
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

<style>
  .vcard {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    background: var(--color-bg-hover);
    border-radius: 12px;
    max-width: 320px;
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--color-accent);
    color: var(--color-accent-fg);
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
    color: var(--color-fg-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .open {
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-size: var(--text-xs);
    font-weight: 600;
    flex: 0 0 auto;
  }
  .caption {
    margin-top: 6px;
    white-space: pre-wrap;
  }
</style>
