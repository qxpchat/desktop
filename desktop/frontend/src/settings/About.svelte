<script lang="ts">
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';

  type SystemInfo = Record<string, unknown>;
  let info = $state<SystemInfo | null>(null);

  onMount(async () => {
    try {
      info = await rpc.call<SystemInfo>('get_system_info');
    } catch {
      info = null;
    }
  });
</script>

<h2>About</h2>

<div class="card">
  <h3>qxp-web</h3>
  <p class="muted">Web client for the Delta Chat protocol — a sibling to the iOS qxp app.</p>
  {#if info}
    <pre>{JSON.stringify(info, null, 2)}</pre>
  {:else}
    <p class="muted">Loading system info…</p>
  {/if}
</div>

<style>
  h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-xl);
  }
  h3 {
    margin: 0 0 6px 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .card {
    max-width: 640px;
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
  }
  .muted {
    color: var(--color-fg-secondary);
  }
  pre {
    background: var(--color-bg);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    overflow-x: auto;
    font-size: var(--text-xs);
  }
</style>
