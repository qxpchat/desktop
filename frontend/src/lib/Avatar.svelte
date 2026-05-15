<script lang="ts">
  // Single source of truth for profile / chat avatars across the app. Always
  // a rounded square — `border-radius` scales with size (≈ 20% of the
  // side, matching macOS-style rounding). Falls back to the first letter
  // of `name` painted on `color`; if `imagePath` is set, renders the
  // daemon-served file instead.
  import { fileUrl } from './files';
  import { t } from './i18n/i18n.svelte';

  type Props = {
    name: string;
    /** Solid background colour for the initial fallback. */
    color?: string;
    imagePath?: string | null;
    /** Side length in px. */
    size?: number;
    /** Optional alt text — defaults to the name. */
    alt?: string;
    /** Render the small green presence dot in the bottom-right when the
     *  contact / chat has been seen recently (deltachat-core's
     *  `was_seen_recently`). Same dot iOS overlays in its `AvatarView`. */
    seenRecently?: boolean;
  };

  let { name, color, imagePath = null, size = 40, alt, seenRecently = false }: Props = $props();

  let initial = $derived(name[0]?.toUpperCase() ?? '?');
  let bg = $derived(imagePath ? 'var(--color-bg-hover)' : color);
  let radius = $derived(Math.max(4, Math.round(size * 0.2)));
  let fontPx = $derived(Math.max(12, Math.round(size * 0.45)));
  // Presence dot scales with the avatar — ~22% of side, capped so it
  // stays visible on tiny avatars and doesn't overwhelm large ones.
  let dotPx = $derived(Math.max(6, Math.min(14, Math.round(size * 0.22))));
</script>

<span
  class="wrap"
  style:width="{size}px"
  style:height="{size}px"
>
  <span
    class="avatar"
    style:width="{size}px"
    style:height="{size}px"
    style:background={bg}
    style:border-radius="{radius}px"
    style:font-size="{fontPx}px"
  >
    {#if imagePath}
      <img src={fileUrl(imagePath)} alt={alt ?? name} />
    {:else}
      {initial}
    {/if}
  </span>
  {#if seenRecently}
    <span
      class="presence"
      aria-label={t('Online recently')}
      style:width="{dotPx}px"
      style:height="{dotPx}px"
    ></span>
  {/if}
</span>

<style>
  .wrap {
    position: relative;
    flex: 0 0 auto;
    display: inline-block;
    line-height: 0;
  }
  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    overflow: hidden;
    line-height: 1;
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .presence {
    position: absolute;
    right: 0;
    bottom: 0;
    border-radius: 50%;
    background: var(--color-success);
    /* Ring against the avatar so the dot reads against any image. */
    box-shadow: 0 0 0 2px var(--color-bg-pane);
  }
</style>
