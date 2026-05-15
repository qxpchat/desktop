<script lang="ts">
  // Resolves the lat/lon for a `hasLocation` message by querying the
  // chat's location range around the message's timestamp (deltachat-jsonrpc
  // doesn't surface coords on `MessageObject`, only via `get_locations`).
  // Renders a static OSM map preview keyed off the resolved coordinates.
  import type { Message } from '../../lib/state/chat.svelte';
  import { rpc } from '../../lib/rpc';
  import { accounts } from '../../lib/state/accounts.svelte';
  import { chat } from '../../lib/state/chat.svelte';
  import { osmEmbedUrl, osmShareUrl } from '../../lib/format/openstreetmap';
  import { t } from '../../lib/i18n/i18n.svelte';

  type Props = {
    message: Message;
    /** Tile colour triple — see MessageBubble. `bg` is the bubble fill
     *  behind the tile, `fg` the text colour. `accent` is accepted for a
     *  uniform call site but unused — the map cell has no accent puck. */
    bg: string;
    fg: string;
    accent: string;
  };

  let { message, bg, fg }: Props = $props();

  type Loc = {
    locationId: number;
    isIndependent: boolean;
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
    contactId: number;
    msgId: number;
    chatId: number;
    marker: string | null;
  };

  let coord = $state<{ lat: number; lon: number } | null>(null);

  $effect(() => {
    if (!message.hasLocation) return;
    const accountId = accounts.selectedId;
    const chatId = chat.active?.chatId;
    if (accountId == null || chatId == null) return;
    void resolve(accountId, chatId);
  });

  async function resolve(accountId: number, chatId: number) {
    try {
      // A 60-second window around the message timestamp is wide enough to
      // catch the matching location row without sweeping the whole chat
      // history each time a cell mounts.
      const ts = message.timestamp;
      const locs = await rpc.call<Loc[]>('get_locations', [
        accountId,
        chatId,
        null,
        ts - 60,
        ts + 60,
      ]);
      const hit = locs.find((l) => l.msgId === message.id);
      if (hit) coord = { lat: hit.latitude, lon: hit.longitude };
    } catch {
      /* leave coord null — the placeholder card still renders */
    }
  }

  let mapEmbed = $derived(coord ? osmEmbedUrl(coord.lat, coord.lon) : null);
  let osmLink = $derived(coord ? osmShareUrl(coord.lat, coord.lon) : null);
</script>

{#if message.hasLocation}
  {#if coord && mapEmbed && osmLink}
    <div class="map-card" style:--cell-bg={bg} style:--cell-fg={fg}>
      <iframe
        class="map"
        src={mapEmbed}
        title={t('Map at {lat}, {lon}', { lat: coord.lat.toFixed(5), lon: coord.lon.toFixed(5) })}
        loading="lazy"
        referrerpolicy="no-referrer"
      ></iframe>
      <a class="coord" href={osmLink} target="_blank" rel="noopener noreferrer" title={t('Open in OpenStreetMap')}>
        <span class="pin" aria-hidden="true">📍</span>
        <span class="latlon">{coord.lat.toFixed(5)}, {coord.lon.toFixed(5)}</span>
      </a>
    </div>
  {:else}
    <div class="card" style:--cell-bg={bg} style:--cell-fg={fg}>
      <div class="thumb" aria-hidden="true">📍</div>
      <div class="meta">
        <div class="title">{t('Location')}</div>
        <div class="hint">{t('Resolving coordinates…')}</div>
      </div>
    </div>
  {/if}
{/if}
{#if message.text}
  <div class="caption">{message.text}</div>
{/if}

<style>
  .map-card {
    display: flex;
    flex-direction: column;
    color: var(--cell-fg);
    border-radius: 12px;
    overflow: hidden;
    max-width: 320px;
  }
  .map {
    display: block;
    width: 100%;
    height: 160px;
    border: 0;
    background: var(--cell-bg);
  }
  .coord {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    font-size: var(--text-sm);
    color: color-mix(in srgb, var(--cell-fg) 65%, transparent);
    font-variant-numeric: tabular-nums;
    text-decoration: none;
  }
  .coord:hover {
    background: color-mix(in srgb, var(--cell-fg) 8%, transparent);
    color: var(--cell-fg);
  }
  .pin {
    font-size: 14px;
    line-height: 1;
  }
  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--cell-fg);
    max-width: 320px;
  }
  .thumb {
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
    color: color-mix(in srgb, var(--cell-fg) 55%, transparent);
    font-size: var(--text-xs);
  }
  .caption {
    margin-top: 6px;
    white-space: pre-wrap;
  }
</style>
