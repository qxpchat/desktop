<script lang="ts">
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Icon from '../lib/Icon.svelte';
  import Badge from '../lib/Badge.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    visible: boolean;
    count: number;
    onClick: () => void;
  };

  let { visible, count, onClick }: Props = $props();
</script>

{#if visible}
  <button
    class="scroll-to-latest"
    onclick={onClick}
    aria-label={t('Scroll to latest')}
    transition:scale={{ start: 0.7, duration: 160, easing: cubicOut }}
  >
    <span class="arrow" aria-hidden="true"><Icon name="chevron-down" size={20} /></span>
    {#if count > 0}
      <Badge {count} corner ring="var(--color-bg-elevated)" />
    {/if}
  </button>
{/if}

<style>
  .scroll-to-latest {
    position: absolute;
    right: var(--space-4);
    bottom: var(--space-3);
    width: 40px;
    height: 40px;
    border-radius: 20px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    box-shadow: 0 4px 12px var(--color-shadow);
    color: var(--color-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.1s ease;
  }
  .scroll-to-latest:hover {
    transform: translateY(-1px);
  }
  .arrow {
    display: inline-flex;
    line-height: 1;
  }
</style>
