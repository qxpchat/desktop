<script lang="ts">
  // A settings section in the Signal Desktop pattern: optional bold title,
  // children (rows) flush with page padding, and a border-bottom that
  // separates from the next section. No card / rounded container —
  // dividers, not panels.
  import type { Snippet } from 'svelte';

  type Props = {
    title?: string;
    /** Footer caption shown below the rows (e.g. "Messages are received on all relays."). */
    footer?: string;
    children: Snippet;
  };

  let { title, footer, children }: Props = $props();
</script>

<fieldset class="section">
  {#if title}<legend class="title">{title}</legend>{/if}
  <div class="body">
    {@render children()}
  </div>
  {#if footer}<p class="footer">{footer}</p>{/if}
</fieldset>

<style>
  .section {
    border: 0;
    padding: 0;
    margin: 0;
  }
  .section + :global(.section) {
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-border);
    margin-top: var(--space-5);
  }
  .title {
    display: block;
    font-weight: 600;
    font-size: var(--text-md);
    margin: 0 0 var(--space-3);
    padding: 0;
    color: var(--color-fg);
  }
  .body {
    display: flex;
    flex-direction: column;
  }
  .footer {
    margin: var(--space-3) 0 0;
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
</style>
