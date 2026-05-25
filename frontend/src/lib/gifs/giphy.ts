// Giphy search wrapper + URL detector. Used by GifPicker for search, and by
// MessageBubble to decide whether a text body should render inline as an
// animated GIF.
//
// Key strategy: build-time `VITE_GIPHY_API_KEY` env var, with the public
// Giphy beta key as a fallback so a fresh checkout works without setup
// (heavily rate-limited — a real key is required for production).

import { t } from '../i18n/i18n.svelte';

const BASE = 'https://api.giphy.com/v1/gifs';
const API_KEY = import.meta.env.VITE_GIPHY_API_KEY || 'dc6zaTOxFJmzC';

export type GifResult = {
  id: string;
  title: string;
  /** Direct GIF URL — what we send on the wire and also fetch for caching. */
  url: string;
  width: number;
  height: number;
};

/** Search Giphy for `term`. Empty term → no request, empty result. */
export async function searchGifs(term: string, limit = 24): Promise<GifResult[]> {
  const q = term.trim();
  if (!q) return [];
  const u = new URL(`${BASE}/search`);
  u.searchParams.set('api_key', API_KEY);
  u.searchParams.set('q', q);
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('rating', 'pg-13');
  const res = await fetch(u);
  if (!res.ok) throw new Error(`giphy search failed: ${res.status}`);
  const json = (await res.json()) as { data?: GiphyApiGif[] };
  return (json.data ?? [])
    .map((g): GifResult => {
      // `fixed_height` is ~200px tall and standard-bandwidth — a reasonable
      // pick for both the picker grid and the inline message bubble. Falls
      // back to `original` if missing (some clips don't carry the
      // standardized renditions).
      const fh = g.images?.fixed_height ?? g.images?.original;
      return {
        id: g.id,
        title: g.title ?? '',
        url: fh?.url ?? '',
        width: Number(fh?.width ?? 0),
        height: Number(fh?.height ?? 0),
      };
    })
    .filter((g) => g.url);
}

type GiphyImage = { url?: string; width?: string | number; height?: string | number };
type GiphyApiGif = {
  id: string;
  title?: string;
  images?: { fixed_height?: GiphyImage; original?: GiphyImage };
};

// Giphy CDN hostnames in the wild: `media.giphy.com`, `media0–4.giphy.com`,
// `i.giphy.com`. File extension is one of `.gif`, `.mp4`, `.webp`. We only
// match URLs that are *purely* a giphy media URL (no surrounding text) so a
// pasted "look at this https://media.giphy.com/... lol" stays plain text.
const GIPHY_URL_RE =
  /^https?:\/\/(?:media\d?\.giphy\.com|i\.giphy\.com)\/[^\s]+\.(?:gif|mp4|webp)(?:\?[^\s]*)?$/i;

/** True when `text` (after trim) is a bare giphy media URL. */
export function isGiphyUrl(text: string | null | undefined): boolean {
  if (!text) return false;
  return GIPHY_URL_RE.test(text.trim());
}

/** Summary swap: if `text` is a giphy media URL, return the localised "GIF"
 *  label with a clapper-board emoji (a distinct, widely-recognised
 *  emoji-default codepoint — `🎞` would have suited but renders as a thin
 *  text-style glyph on systems that honour its Unicode default presentation,
 *  which made the space after it look like it had vanished); otherwise
 *  return the text unchanged. Used by every surface that would otherwise
 *  leak the raw cdn URL — chat-list preview, notification banner, reply
 *  quote — so the swap rule lives in exactly one place. */
export function gifLabelOr(text: string): string {
  return isGiphyUrl(text) ? `🎬 ${t('GIF')}` : text;
}
