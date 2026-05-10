<script lang="ts">
  // qxp logomark. Path data lives in `qxpLogoPath.ts` so the favicon
  // generator can reuse it; this component handles only the SVG framing
  // and renders with `currentColor` so callers re-tint via CSS.
  import { QXP_LOGO_PATH_D, QXP_LOGO_VIEWBOX } from './qxpLogoPath';

  type Props = {
    size?: string;
    label?: string;
  };
  let { size = '128px', label = 'qxp' }: Props = $props();
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
  <path fill="currentColor" d={QXP_LOGO_PATH_D} />
</svg>

<style>
  .logo {
    display: block;
  }
</style>
