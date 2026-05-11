<script lang="ts">
  // Single source of truth for profile / chat avatars across the app. Always
  // a rounded square — `border-radius` scales with size (≈ 20% of the
  // side, matching macOS-style rounding). Falls back to the first letter
  // of `name` painted on `color`; if `imagePath` is set, renders the
  // daemon-served file instead.
  import { fileUrl } from './files';

  type Props = {
    name: string;
    /** Solid background colour for the initial fallback. */
    color?: string;
    imagePath?: string | null;
    /** Side length in px. */
    size?: number;
    /** Optional alt text — defaults to the name. */
    alt?: string;
  };

  let { name, color, imagePath = null, size = 40, alt }: Props = $props();

  let initial = $derived(name[0]?.toUpperCase() ?? '?');
  let bg = $derived(imagePath ? 'var(--color-bg-hover)' : color);
  let radius = $derived(Math.max(4, Math.round(size * 0.2)));
  let fontPx = $derived(Math.max(12, Math.round(size * 0.45)));
</script>

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

<style>
  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    overflow: hidden;
    flex: 0 0 auto;
    line-height: 1;
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
