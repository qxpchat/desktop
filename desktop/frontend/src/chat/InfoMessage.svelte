<script lang="ts">
  import type { Message } from '../lib/state/chat.svelte';

  type Props = {
    message: Message;
  };

  let { message }: Props = $props();
</script>

<div class="info" role="note">
  <span>{message.text}</span>
</div>

<style>
  .info {
    display: flex;
    justify-content: center;
    padding: var(--space-2) var(--space-4);
  }
  .info span {
    max-width: 80%;
    text-align: center;
    color: var(--color-fg-tertiary);
    font-size: var(--text-xs);
    line-height: 1.4;
    background: var(--color-bg-hover);
    padding: 4px 10px;
    border-radius: 12px;
  }
</style>
