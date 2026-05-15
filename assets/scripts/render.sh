#!/usr/bin/env nix-shell
#!nix-shell -i bash -p imagemagick file
# Rasterise the qxp logomark from `assets/logo.svg` and write the desktop
# Tauri icon:
#
#   src-tauri/icons/icon.png                               1024x1024 RGBA
#       Gradient logo shape on a transparent background. `tauri::generate_context!`
#       validates the bundle icon as RGBA; macOS Dock convention is a transparent
#       surround.
#
# Output is written to assets/generated/desktop-icon.png (the canonical
# committed location for derivatives); a copy step in generate-logo.py
# then fans it out to the platform-specific path.
#
# Source SVG technique: a single path traces the viewBox-sized rect plus
# the logo's interior subpaths under nonzero winding. Rendered on a white
# background this gives a white logo silhouette on black — exactly the
# alpha mask we need. We rasterise that mask, then paint a vertical
# gradient through it with CopyOpacity.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/assets/logo.svg"
# Output goes into assets/generated/ (the canonical committed location for
# derivatives). A separate copy step in generate-logo.py then fans it out
# to the gitignored platform-specific path.
DESKTOP_OUT="$ROOT/assets/generated/desktop-icon.png"
SIZE=1024
FILL=0.70   # logo occupies ~70% of the canvas, leaving ~15% margin each side
TOP="#00FF9D"
BOTTOM="#22CCAA"

# Read the viewBox side from the SVG so the rasteriser DPI stays accurate
# even if the source is later re-authored at a different intrinsic size.
VB=$(grep -oE 'viewBox="[0-9. -]+"' "$SRC" | head -1 \
     | sed -E 's/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/\1/')

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Rasterise at 2x target size for headroom through trim+resize. Path 1 in
# the source SVG fills the negative space (rect with the logo punched out),
# so rendering on a white background gives a white logo silhouette on
# black directly — no inversion needed.
DPI=$(awk "BEGIN{printf \"%.3f\", 72 * 2 * $SIZE / $VB}")
magick -density "$DPI" -background white "$SRC" -flatten \
       -colorspace gray -alpha off "$TMP/raw.png"

# Trim to the logo's actual bbox (source pads it unevenly inside the
# viewBox), scale to FILL of final canvas, then centre on a SIZExSIZE
# black canvas.
FILLPX=$(awk "BEGIN{printf \"%d\", $SIZE * $FILL}")
magick "$TMP/raw.png" -trim +repage \
       -resize "${FILLPX}x${FILLPX}" \
       -background black -gravity center -extent "${SIZE}x${SIZE}" \
       "$TMP/mask.png"

# Measure where the logo sits vertically in the final mask so the gradient
# spans the logo band (not the full canvas). %Y returns "+NN"; strip the +.
read -r GRAD_Y1 GRAD_H < <(magick "$TMP/mask.png" -trim -format "%Y %h\n" info: | tr -d '+')
GRAD_Y2=$((GRAD_Y1 + GRAD_H))
TAIL=$((SIZE - GRAD_Y2))
magick -size "${SIZE}x${GRAD_Y1}" "xc:${TOP}" \
       \( -size "${SIZE}x${GRAD_H}" "gradient:${TOP}-${BOTTOM}" \) \
       \( -size "${SIZE}x${TAIL}" "xc:${BOTTOM}" \) \
       -append "$TMP/grad.png"

# Desktop Tauri icon — gradient logo on a transparent background, RGBA.
# CopyOpacity drives the alpha channel from the mask; `PNG32:` forces
# RGBA output.
magick "$TMP/grad.png" "$TMP/mask.png" \
  -compose CopyOpacity -composite PNG32:"$DESKTOP_OUT"

echo "wrote $DESKTOP_OUT"
file "$DESKTOP_OUT"
magick "$DESKTOP_OUT" -format "logo band y=${GRAD_Y1}..${GRAD_Y2}  top=%[pixel:p{512,$((GRAD_Y1+20))}]  bot=%[pixel:p{512,$((GRAD_Y2-20))}]\n" info:
