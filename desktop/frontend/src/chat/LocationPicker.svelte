<script lang="ts">
  // One-shot location-share modal. Asks the browser for the user's current
  // coordinates via `navigator.geolocation`, previews them on a static OSM
  // tile (no deps, no interactive map library), then calls `onSend(lat, lon)`
  // which the caller routes through `sendMessage({ location: [lat, lon] })`.
  //
  // Live-location streaming (the equivalent of iOS's "Share live location
  // for …" sheet) needs the daemon's `send_locations_to_chat` /
  // `set_location` RPCs exposed via deltachat-jsonrpc; those aren't in this
  // build of core, so the live-mode button is omitted here.
  import Icon from '../lib/Icon.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    open: boolean;
    onSend: (lat: number, lon: number) => void;
    onClose: () => void;
  };

  let { open, onSend, onClose }: Props = $props();

  let coord = $state<{ lat: number; lon: number; accuracy: number } | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let lastOpen = false;

  $effect(() => {
    if (open && !lastOpen) {
      lastOpen = true;
      coord = null;
      error = null;
      void requestLocation();
    } else if (!open) {
      lastOpen = false;
    }
  });

  async function requestLocation() {
    if (!navigator.geolocation) {
      error = t('Geolocation is not available.');
      return;
    }
    busy = true;
    error = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      coord = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function send() {
    if (!coord) return;
    onSend(coord.lat, coord.lon);
    onClose();
  }

  // OSM's official iframe embed — more reliable than the community
  // static-map endpoint (which gets blocked / rate-limited in places).
  // bbox is a tight ~1km box around the point so zoom looks roughly
  // similar to a static-map at zoom 15.
  let mapUrl = $derived.by(() => {
    if (!coord) return null;
    const d = 0.005;
    const bbox = [coord.lon - d, coord.lat - d, coord.lon + d, coord.lat + d].join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${coord.lat},${coord.lon}`;
  });

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') onClose();
    else if (e.key === 'Enter' && coord) send();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="overlay" role="dialog" aria-modal="true" aria-label={t('Send Location')} data-testid="location-picker">
    <button class="backdrop" onclick={onClose} aria-label={t('Close')}></button>
    <div class="card">
      <header>
        <h2>{t('Send Location')}</h2>
        <button class="close" onclick={onClose} aria-label={t('Close')}>✕</button>
      </header>

      <div class="body">
        {#if busy}
          <div class="placeholder muted">{t('Locating…')}</div>
        {:else if error}
          <div class="placeholder error">{error}</div>
          <button class="link" onclick={requestLocation}>{t('Try again')}</button>
        {:else if coord && mapUrl}
          <iframe
            class="map"
            src={mapUrl}
            title={t('Map preview')}
            loading="lazy"
            referrerpolicy="no-referrer"
          ></iframe>
          <p class="coord">
            <span class="latlon">{coord.lat.toFixed(5)}, {coord.lon.toFixed(5)}</span>
            <span class="acc">±{Math.round(coord.accuracy)} m</span>
          </p>
        {/if}
      </div>

      <div class="actions">
        <button onclick={onClose} data-testid="location-picker__cancel">{t('Cancel')}</button>
        <button class="primary" onclick={send} disabled={!coord || busy} data-testid="location-picker__send">
          <Icon name="map-pin" size={14} stroke={2.5} />
          {t('Send this location')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
  }
  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    border: 0;
  }
  .card {
    position: relative;
    width: min(520px, calc(100vw - 2 * var(--space-4)));
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 48px var(--color-shadow);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .close {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-fg-secondary);
  }
  .close:hover {
    background: var(--color-bg-hover);
  }
  .body {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .placeholder {
    aspect-ratio: 12 / 7;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-hover);
    border-radius: var(--radius-md);
    color: var(--color-fg-secondary);
    font-size: var(--text-md);
  }
  .placeholder.error {
    color: var(--color-danger);
  }
  .map {
    width: 100%;
    height: 240px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--color-bg-hover);
    display: block;
  }
  .coord {
    margin: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
  }
  .acc {
    color: var(--color-fg-tertiary);
    font-size: var(--text-xs);
  }
  .link {
    align-self: flex-start;
    background: transparent;
    color: var(--color-accent);
    font-weight: 500;
    padding: 0;
  }
  .link:hover {
    text-decoration: underline;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-border);
  }
  .actions button {
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    font-weight: 600;
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .actions button:hover:not(:disabled) {
    background: var(--color-border);
  }
  .actions .primary {
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .actions .primary:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  .actions button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
