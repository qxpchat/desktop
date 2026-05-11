<script lang="ts">
  // Lite YouTube preview — shows the official thumbnail with a play
  // overlay until the user clicks, then swaps in the iframe player. This
  // means we don't hit youtube.com (cookies, tracking) just to render the
  // chat, only when the user actually wants to watch.
  type Props = { videoId: string };
  let { videoId }: Props = $props();

  import { t } from '../../lib/i18n/i18n.svelte';

  let loaded = $state(false);
  // `i.ytimg.com` is the same CDN YouTube itself uses for thumbnails.
  // `hqdefault` (480×360) is always present; `maxresdefault` isn't.
  let thumb = $derived(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  let embed = $derived(
    `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`,
  );
</script>

<div class="yt">
  {#if !loaded}
    <button class="lite" onclick={() => (loaded = true)} aria-label={t('Play YouTube video')}>
      <img src={thumb} alt="" loading="lazy" />
      <span class="play" aria-hidden="true">
        <svg viewBox="0 0 68 48" width="56" height="40">
          <path
            class="bg"
            d="M66.52 7.74a8.05 8.05 0 0 0-5.66-5.7C55.81.5 34 .5 34 .5s-21.81 0-26.86 1.54a8.05 8.05 0 0 0-5.66 5.7C0 12.81 0 24 0 24s0 11.19 1.48 16.26a8.05 8.05 0 0 0 5.66 5.7C12.19 47.5 34 47.5 34 47.5s21.81 0 26.86-1.54a8.05 8.05 0 0 0 5.66-5.7C68 35.19 68 24 68 24s0-11.19-1.48-16.26z"
            fill="#212121" fill-opacity="0.8"
          />
          <path d="M45 24L27 14v20" fill="#fff" />
        </svg>
      </span>
    </button>
  {:else}
    <iframe
      src={embed}
      title={t('YouTube video')}
      loading="lazy"
      allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  {/if}
</div>

<style>
  .yt {
    margin-top: 6px;
    /* Pin an explicit width: the lite preview has a 480×360 `<img>` that
     * gives the bubble an intrinsic size to grow into, but the iframe has
     * no intrinsic size — switching to it would otherwise collapse the
     * bubble. `max-width: 100%` keeps it inside narrow bubble-wraps. */
    width: 480px;
    max-width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 10px;
    overflow: hidden;
    background: #000;
  }
  .lite {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 0;
    background: transparent;
    display: block;
    cursor: pointer;
  }
  .lite img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .play {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.12s ease;
    pointer-events: none;
  }
  .lite:hover .play {
    transform: translate(-50%, -50%) scale(1.06);
  }
  .lite:hover .play :global(.bg) {
    fill: #cc0000;
    fill-opacity: 1;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
</style>
