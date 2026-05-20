<script lang="ts">
  import { toast } from './state/toast.svelte';
</script>

{#if toast.message}
  <div class="toast" role="status" aria-live="polite" data-testid="toast">
    {toast.message}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom, 0) + var(--space-5));
    transform: translateX(-50%);
    z-index: 1000;
    max-width: min(360px, calc(100vw - var(--space-5) * 2));
    padding: var(--space-2) var(--space-4);
    background: var(--color-fg);
    color: var(--color-bg);
    font-size: var(--text-sm);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.18));
    pointer-events: none;
    animation: toast-in 0.16s ease-out;
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to   { opacity: 1; transform: translate(-50%, 0); }
  }
</style>
