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
  import Modal from '../lib/Modal.svelte';
  import Button from '../lib/Button.svelte';
  import { osmEmbedUrl } from '../lib/format/openstreetmap';
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

  let mapUrl = $derived(coord ? osmEmbedUrl(coord.lat, coord.lon) : null);

  // Enter-to-send is a quality-of-life shortcut; Modal handles Escape.
  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Enter' && coord) send();
  }
</script>

<svelte:window onkeydown={onKey} />

<Modal {open} {onClose} size="lg" ariaLabel={t('Send Location')} data-testid="location-picker">
  <div class="content">
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
      <Button variant="secondary" onclick={onClose} data-testid="location-picker__cancel">{t('Cancel')}</Button>
      <Button variant="primary" onclick={send} disabled={!coord || busy} data-testid="location-picker__send">
        <Icon name="map-pin" size={14} stroke={2.5} />
        {t('Send this location')}
      </Button>
    </div>
  </div>
</Modal>

<style>
  .content {
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
</style>
