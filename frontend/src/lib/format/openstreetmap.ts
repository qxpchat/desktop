// Shared URL builders for the OSM iframe embed + the "open in OSM" share
// link. Used by LocationPicker, LocationCell, and ChatInfo's live-location
// card. The `0.005` half-degree bbox produces a roughly-zoom-15 view that
// matches what static-map endpoints (which we're not using; CORS/rate-limit
// hell) would render.
const BBOX_HALF_DEG = 0.005;

export function osmEmbedUrl(lat: number, lon: number): string {
  const bbox = [
    lon - BBOX_HALF_DEG,
    lat - BBOX_HALF_DEG,
    lon + BBOX_HALF_DEG,
    lat + BBOX_HALF_DEG,
  ].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

export function osmShareUrl(lat: number, lon: number, zoom: number = 16): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}
