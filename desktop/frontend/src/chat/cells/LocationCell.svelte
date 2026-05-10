<script lang="ts">
  import type { Message } from '../../lib/state/chat.svelte';

  type Props = {
    message: Message;
  };

  let { message }: Props = $props();

  // Locations are passed via the messages table — we don't have direct lat/lon
  // on `MessageObject`. The chat-info layer (Phase 19) joins `get_locations`.
  // For now, if the message has hasLocation we just show a generic placeholder.
  // Real point rendering lands when get_locations is wired up.
  let hasLoc = $derived(message.hasLocation);
</script>

{#if hasLoc}
  <div class="card">
    <div class="map" aria-hidden="true">📍</div>
    <div class="meta">
      <div class="title">Location</div>
      <div class="hint">Open the chat info to see the map.</div>
    </div>
  </div>
{/if}
{#if message.text}
  <div class="caption">{message.text}</div>
{/if}

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    background: var(--color-bg-hover);
    border-radius: 12px;
    max-width: 320px;
  }
  .map {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    background: linear-gradient(135deg, #c8e6c9, #81c784);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
  }
  .meta {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-weight: 600;
  }
  .hint {
    color: var(--color-fg-tertiary);
    font-size: var(--text-xs);
  }
  .caption {
    margin-top: 6px;
    white-space: pre-wrap;
  }
</style>
