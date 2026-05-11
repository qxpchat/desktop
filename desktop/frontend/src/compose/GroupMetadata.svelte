<script lang="ts">
  import { rpc } from '../lib/rpc';
  import { contacts } from '../lib/state/contacts.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import { backToInbox, setPaneMode } from '../lib/state/paneMode.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    mode: {
      kind: 'setGroupMetadata';
      flow: 'group' | 'channel';
      selected: number[];
    };
    onSelectChat: (chatId: number) => void;
  };

  let { mode, onSelectChat }: Props = $props();

  let name = $state('');
  let description = $state('');
  let verified = $state(false);
  let creating = $state(false);
  let error = $state<string | null>(null);

  let allSelectedAreVerified = $derived(
    mode.selected.every(
      (id) => contacts.contacts.find((c) => c.id === id)?.isVerified ?? false,
    ),
  );

  let canCreate = $derived(name.trim().length > 0 && !creating);

  let title = $derived(mode.flow === 'group' ? t('New Group') : t('New Channel'));

  async function create() {
    if (!canCreate || accounts.selectedId == null) return;
    const accountId = accounts.selectedId;
    creating = true;
    error = null;
    try {
      let chatId: number;
      if (mode.flow === 'group') {
        chatId = await rpc.call<number>('create_group_chat', [
          accountId,
          name.trim(),
          verified && allSelectedAreVerified,
        ]);
      } else {
        chatId = await rpc.call<number>('create_broadcast', [accountId, name.trim()]);
      }

      for (const contactId of mode.selected) {
        try {
          await rpc.call('add_contact_to_chat', [accountId, chatId, contactId]);
        } catch (err) {
          console.warn(`add_contact_to_chat ${contactId} failed`, err);
        }
      }

      // No JSON-RPC for group description in core — skip for now.
      void description;

      onSelectChat(chatId);
      backToInbox();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      creating = false;
    }
  }

  function back() {
    setPaneMode({ kind: 'chooseMembers', flow: mode.flow, selected: mode.selected });
  }
</script>

<div class="pane">
  <header class="header">
    <button class="back" onclick={back} aria-label={t('Back')}>‹</button>
    <h2>{title}</h2>
    <div class="spacer"></div>
    <button class="create" disabled={!canCreate} onclick={create}>{t('Create')}</button>
  </header>

  <div class="body">
    <label class="field">
      <span class="label">{t('Name')}</span>
      <input bind:value={name} placeholder={mode.flow === 'group' ? t('Project chat') : t('Updates')} />
    </label>

    {#if mode.flow === 'group'}
      <label class="field">
        <span class="label">{t('Description (optional)')}</span>
        <textarea bind:value={description} rows="2" placeholder={t('What\'s this group about?')}
        ></textarea>
      </label>

      <label class="toggle" class:disabled={!allSelectedAreVerified}>
        <input
          type="checkbox"
          bind:checked={verified}
          disabled={!allSelectedAreVerified}
        />
        <span>
          {t('Verified group')}
          {#if !allSelectedAreVerified}
            <span class="hint">{t('— available only when every member is already verified')}</span>
          {/if}
        </span>
      </label>
    {/if}

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <p class="member-count">
      {t('{count} members will be added.', { count: mode.selected.length })}
    </p>
  </div>
</div>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    min-height: 56px;
  }
  .back {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    color: var(--color-accent);
    font-size: 22px;
    line-height: 1;
  }
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .create {
    height: 32px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
  }
  .create:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .label {
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
    font-weight: 500;
  }
  .field input,
  .field textarea {
    padding: 8px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    font-family: inherit;
    font-size: var(--text-md);
    color: var(--color-fg);
  }
  .field input:focus,
  .field textarea:focus {
    outline: none;
  }
  .toggle {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: var(--space-2) 0;
    cursor: pointer;
  }
  .toggle.disabled {
    opacity: 0.6;
    cursor: default;
  }
  .toggle .hint {
    color: var(--color-fg-tertiary);
    font-size: var(--text-xs);
  }
  .error {
    color: var(--color-danger);
    margin: 0;
  }
  .member-count {
    color: var(--color-fg-tertiary);
    font-size: var(--text-sm);
    margin: var(--space-2) 0 0;
  }
</style>
