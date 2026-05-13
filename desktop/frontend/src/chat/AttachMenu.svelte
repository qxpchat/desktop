<script lang="ts">
  import Icon, { type IconName } from '../lib/Icon.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    open: boolean;
    onClose: () => void;
    onPickFile: () => void;
    onShareLocation: () => void;
    onShareContact: () => void;
  };

  let {
    open,
    onClose,
    onPickFile,
    onShareLocation,
    onShareContact,
  }: Props = $props();

  function pick(fn: () => void) {
    onClose();
    fn();
  }

  const items: { icon: IconName; label: string; action: () => void; tid: string }[] = $derived([
    { icon: 'file', label: t('File'), action: onPickFile, tid: 'file' },
    { icon: 'map-pin', label: t('Location'), action: onShareLocation, tid: 'location' },
    { icon: 'user', label: t('Contact'), action: onShareContact, tid: 'contact' },
  ]);
</script>

{#if open}
  <button class="backdrop" onclick={onClose} aria-label={t('Close attach menu')}></button>
  <div class="menu" role="menu" aria-label={t('Attach')} data-testid="attach-menu">
    {#each items as it}
      <button role="menuitem" onclick={() => pick(it.action)} data-testid="attach-menu-item" data-action={it.tid}>
        <span class="icon" aria-hidden="true"><Icon name={it.icon} size={18} /></span>
        <span>{it.label}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 9;
  }
  .menu {
    position: absolute;
    bottom: 56px;
    left: 8px;
    z-index: 10;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px var(--color-shadow);
    overflow: hidden;
    min-width: 200px;
  }
  .menu button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    width: 100%;
    padding: 10px 14px;
    text-align: left;
    background: transparent;
    color: var(--color-fg);
    font-size: var(--text-md);
  }
  .menu button:hover {
    background: var(--color-bg-hover);
  }
  .menu button + button {
    border-top: 1px solid var(--color-border);
  }
  .icon {
    width: 24px;
    color: var(--color-fg-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
</style>
