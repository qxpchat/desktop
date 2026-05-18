<script lang="ts">
  // A settings section in the Signal Desktop pattern: optional bold title,
  // children (rows) flush with page padding, and a border-top divider
  // separating consecutive sections. No card / rounded container —
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

<section class="section">
  {#if title}<h3 class="title">{title}</h3>{/if}
  <div class="body">
    {@render children()}
  </div>
  {#if footer}<p class="footer">{footer}</p>{/if}
</section>

<style>
  /* Plain block <section> laid out as a flex column so the title / body /
   * footer gaps come only from the explicit margins below and never
   * collapse — spacing is fully deterministic. (This was a <fieldset> with
   * a <legend> title; a fieldset with `display:flex` renders its legend
   * with unreliable, browser-dependent spacing, which made section gaps
   * look random.) */
  .section {
    display: flex;
    flex-direction: column;
  }
  .section + :global(.section) {
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-border);
    margin-top: var(--space-5);
  }
  .title {
    font-weight: 600;
    font-size: var(--text-lg);
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
