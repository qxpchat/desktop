<script lang="ts">
  // qxp logomark. Path data lives in `qxpLogoPath.ts` so the favicon
  // generator can reuse it; this component owns the SVG framing and the
  // brand vertical gradient (matching the iOS AppIcon — `#00FF9D` top →
  // `#22CCAA` bottom, see `ios/scripts/render-icons.sh`).
  import { QXP_LOGO_PATH_D, QXP_LOGO_VIEWBOX } from './qxpLogoPath';

  type Props = {
    size?: string;
    label?: string;
  };
  let { size = '128px', label = 'qxp' }: Props = $props();

  // Unique gradient id so two Logos on one page don't collide on the
  // SVG-defs lookup.
  const gradId = `qxp-logo-grad-${Math.random().toString(36).slice(2, 10)}`;
</script>

<svg
  class="logo"
  style:width={size}
  style:height={size}
  viewBox={QXP_LOGO_VIEWBOX}
  aria-label={label}
  role="img"
  xmlns="http://www.w3.org/2000/svg"
>
  <defs>
    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#00FF9D" />
      <stop offset="100%" stop-color="#22CCAA" />
    </linearGradient>
  </defs>
  <path fill="url(#{gradId})" d={QXP_LOGO_PATH_D} />
</svg>

<style>
  .logo {
    display: block;
  }
</style>
