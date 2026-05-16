<script lang="ts">
  import type { IconName } from '../lib/Icon.svelte';
  import MenuItem from '../lib/MenuItem.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    open: boolean;
    onClose: () => void;
    onPickFile: () => void;
    onShareContact: () => void;
  };

  let {
    open,
    onClose,
    onPickFile,
    onShareContact,
  }: Props = $props();

  function pick(fn: () => void) {
    onClose();
    fn();
  }

  const items: { icon: IconName; label: string; action: () => void; tid: string }[] = $derived([
    { icon: 'file', label: t('File'), action: onPickFile, tid: 'file' },
    { icon: 'user', label: t('Contact'), action: onShareContact, tid: 'contact' },
  ]);

  // Escape closes — pairs the listener with the open window via effect
  // cleanup so it never lingers while the menu is shut.
  $effect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

{#if open}
  <button class="backdrop" onclick={onClose} aria-label={t('Close attach menu')}></button>
  <div class="menu" role="menu" aria-label={t('Attach')} data-testid="attach-menu">
    {#each items as it (it.tid)}
      <MenuItem
        icon={it.icon}
        label={it.label}
        onclick={() => pick(it.action)}
        data-testid="attach-menu-item"
        data-action={it.tid}
      />
    {/each}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: 0;
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
    padding: 4px;
    min-width: 200px;
  }
</style>
