// `cacheGif(url)` — download a remote GIF (typically a giphy.com URL) and
// hand the bytes to the existing `/upload` daemon endpoint so the resulting
// file sits inside the accounts dir and can be served by `GET /file`. The
// returned path is what the rest of the app stores in recents and renders
// inline.
//
// In-memory pieces:
//  - `pathCache`  : URL → resolved daemon path (avoids re-fetching the same
//                   GIF inside a single session, e.g. between Composer's
//                   "pick" and the subsequent first MessageBubble render).
//  - `inFlight`   : URL → pending Promise, so concurrent callers coalesce
//                   onto one HTTP request.
// Both are session-scoped; recents.svelte.ts persists the URL → localPath
// mapping across reloads.

import { uploadBlob } from '../files';

const pathCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

export async function cacheGif(url: string): Promise<string> {
  const memoed = pathCache.get(url);
  if (memoed) return memoed;
  const pending = inFlight.get(url);
  if (pending) return pending;

  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`gif fetch failed: ${res.status} ${res.statusText}`);
    const blob = await res.blob();
    const ext = pickExt(url, blob.type);
    return uploadBlob(blob, ext);
  })();
  inFlight.set(url, p);
  try {
    const path = await p;
    pathCache.set(url, path);
    return path;
  } finally {
    inFlight.delete(url);
  }
}

/** Forget the URL → path memo. Called from the recents-panel delete flow so
 *  the next render of a message bearing this URL re-downloads instead of
 *  serving a path that no longer exists on disk. */
export function forgetCachedGif(url: string): void {
  pathCache.delete(url);
}

function pickExt(url: string, mime: string): string {
  if (mime === 'image/gif') return 'gif';
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'image/webp') return 'webp';
  const m = url.match(/\.(gif|mp4|webp)(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'gif';
}
