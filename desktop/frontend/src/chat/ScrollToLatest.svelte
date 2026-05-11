<script lang="ts">
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

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
    aria-label="Scroll to latest"
    transition:scale={{ start: 0.7, duration: 160, easing: cubicOut }}
  >
    <span class="arrow" aria-hidden="true">↓</span>
    {#if count > 0}
      <span class="badge">{count > 99 ? '99+' : count}</span>
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
    font-size: 18px;
    line-height: 1;
  }
  .badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-size: var(--text-xs);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--color-bg-elevated);
  }
</style>
