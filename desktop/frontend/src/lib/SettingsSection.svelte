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
    /* `<fieldset>` is a special form element whose contents render
     * inside an anonymous "fieldset content" box that doesn't always
     * honour normal width / stretch rules. Forcing it to act as a flex
     * column (with `min-inline-size: 0` so it can shrink, and an
     * explicit width) makes children — legend, body, footer — stretch
     * across the full Settings content pane. Without this the section
     * collapsed to its widest row's intrinsic width and looked centred. */
    border: 0;
    padding: 0;
    margin: 0;
    min-inline-size: 0;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .section + :global(.section) {
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-border);
    margin-top: var(--space-5);
  }
  .title {
    display: block;
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
