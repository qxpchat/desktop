<script lang="ts">
  // Renders a plain string with inline markdown applied — `**bold**`,
  // `_italic_`, `` `code` ``. Output goes through Svelte's normal
  // text-escaping path (no `{@html}`, no XSS surface). Shared by the
  // message bubble and the chat-list row preview.
  import { parseInlineMarkdown } from './format/markdown';

  let { text }: { text: string } = $props();
</script>

{#each parseInlineMarkdown(text) as run, i (i)}{#if run.style === 'bold'}<strong>{run.text}</strong>{:else if run.style === 'italic'}<em>{run.text}</em>{:else if run.style === 'code'}<code>{run.text}</code>{:else}{run.text}{/if}{/each}

<style>
  /* Translucent overlay so the chip reads on any background. */
  code {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    word-break: break-word;
  }
</style>
