<script lang="ts">
  import { rpc } from '../lib/rpc';
  import { contacts } from '../lib/state/contacts.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import { backToInbox, setPaneMode } from '../lib/state/paneMode.svelte';
  import Button from '../lib/Button.svelte';
  import BackButton from '../lib/BackButton.svelte';
  import TextInput from '../lib/TextInput.svelte';
  import Toggle from '../lib/Toggle.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    mode: {
      kind: 'setGroupMetadata';
      flow: 'group' | 'channel' | 'email';
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

  let title = $derived(
    mode.flow === 'group'
      ? t('New Group')
      : mode.flow === 'email'
        ? t('New Email')
        : t('New Channel'),
  );

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
      } else if (mode.flow === 'email') {
        // Plain-MIME (unencrypted) group — first outbound message ships as
        // a regular email so non-Delta-Chat recipients can read it. Single
        // recipient acts as a plain 1:1 email; multi-recipient acts as a
        // group thread (To / CC of the first message).
        chatId = await rpc.call<number>('create_group_chat_unencrypted', [accountId, name.trim()]);
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
    // Channels skip the member picker — go back to the compose pane.
    if (mode.flow === 'channel') {
      backToInbox();
    } else {
      setPaneMode({ kind: 'chooseMembers', flow: mode.flow, selected: mode.selected });
    }
  }
</script>

<div class="pane" data-testid="group-metadata" data-flow={mode.flow}>
  <header class="header">
    <BackButton label={t('Back')} onclick={back} data-testid="group-metadata__back" />
    <h2>{title}</h2>
    <div class="spacer"></div>
    <Button
      variant="primary"
      size="sm"
      disabled={!canCreate}
      onclick={create}
      data-testid="group-metadata__create"
    >{t('Create')}</Button>
  </header>

  <div class="body">
    <TextInput
      label={mode.flow === 'email' ? t('Subject') : t('Name')}
      bind:value={name}
      placeholder={mode.flow === 'group'
        ? t('Project chat')
        : mode.flow === 'email'
          ? t('Subject of your email')
          : t('Updates')}
      data-testid="group-metadata__name"
    />

    {#if mode.flow === 'group'}
      <TextInput
        label={t('Description (optional)')}
        bind:value={description}
        multiline
        rows={2}
        placeholder={t('What\'s this group about?')}
        data-testid="group-metadata__description"
      />

      <div class="toggle" class:disabled={!allSelectedAreVerified}>
        <span data-testid="group-metadata__verified" data-checked={verified}>
          <Toggle
            checked={verified}
            onChange={(v) => (verified = v)}
            disabled={!allSelectedAreVerified}
            label={t('Verified group')}
          />
        </span>
        <span class="toggle-text">
          {t('Verified group')}
          {#if !allSelectedAreVerified}
            <span class="hint">{t('— available only when every member is already verified')}</span>
          {/if}
        </span>
      </div>
    {/if}

    {#if error}
      <p class="error">{error}</p>
    {/if}

    {#if mode.flow === 'group'}
      <p class="member-count">
        {t('{count} members will be added.', { count: mode.selected.length })}
      </p>
    {:else if mode.flow === 'email'}
      <p class="member-count">
        {t('{count} recipients will be addressed.', { count: mode.selected.length })}
      </p>
    {/if}
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
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .toggle {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) 0;
  }
  .toggle.disabled {
    opacity: 0.6;
  }
  .toggle-text {
    font-size: var(--text-md);
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
