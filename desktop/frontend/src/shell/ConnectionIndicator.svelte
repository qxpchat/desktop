<script lang="ts">
  // Pill shown in the NavTabs footer that surfaces the current WebSocket
  // connection state mid-session. Hidden while we're connected — only
  // appears when something's off so it doesn't clutter the rail.

  import { onMount, onDestroy } from 'svelte';
  import { rpc, type ConnectionStatus } from '../lib/rpc';

  let status = $state<ConnectionStatus>('idle');
  let unsub: (() => void) | null = null;

  onMount(() => {
    unsub = rpc.onStatus((s) => (status = s));
  });
  onDestroy(() => {
    unsub?.();
  });

  let label = $derived.by(() => {
    switch (status) {
      case 'connecting':
      case 'idle':
        return 'Connecting…';
      case 'disconnected':
        return 'Offline';
      default:
        return '';
    }
  });

  let visible = $derived(status !== 'connected');
</script>

{#if visible}
  <div class="indicator" data-state={status}>
    <span class="dot"></span>
    <span class="label">{label}</span>
  </div>
{/if}

<style>
  .indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 10px;
    font-size: var(--text-xs);
    background: var(--color-bg-elevated);
    color: var(--color-fg-secondary);
    border: 1px solid var(--color-border);
  }
  .indicator[data-state='connecting'],
  .indicator[data-state='idle'] {
    color: #b88500;
  }
  .indicator[data-state='disconnected'] {
    color: var(--color-danger);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .indicator[data-state='connecting'] .dot,
  .indicator[data-state='idle'] .dot {
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
  .label {
    line-height: 1;
  }
</style>
