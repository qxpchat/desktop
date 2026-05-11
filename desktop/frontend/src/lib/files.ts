// Helpers for serving daemon-side filesystem paths through the `GET /file`
// endpoint. Works for avatars, message attachments, voice messages — anything
// that comes back from `deltachat-jsonrpc` as an absolute path inside the
// accounts directory.

/** Origin to use for daemon HTTP calls.
 *
 * Empty string (=> same-origin) on the web. `http://127.0.0.1:9090` when
 * running inside the Tauri webview, where the SPA is loaded from
 * `tauri://localhost` and same-origin requests don't reach the bundled
 * daemon. */
export function daemonOrigin(): string {
  const tauriHost = location.protocol === 'tauri:' || location.hostname === 'tauri.localhost';
  return tauriHost ? 'http://127.0.0.1:9090' : '';
}

export function fileUrl(daemonPath: string | null | undefined): string | undefined {
  if (!daemonPath) return undefined;
  return `${daemonOrigin()}/file?path=${encodeURIComponent(daemonPath)}`;
}

/** Pretty file-size formatter for FileCell. */
export function formatBytes(n: number): string {
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Stream a Blob to `POST /upload?ext=…` and return the daemon-side path. */
export async function uploadBlob(blob: Blob, ext: string): Promise<string> {
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'bin';
  const res = await fetch(`${daemonOrigin()}/upload?ext=${safeExt}`, {
    method: 'POST',
    body: blob,
    headers: { 'content-type': blob.type || 'application/octet-stream' },
  });
  if (!res.ok) {
    throw new Error(`upload failed: ${res.status} ${res.statusText}`);
  }
  const { path } = (await res.json()) as { path: string };
  return path;
}

/** Pick the deltachat-core viewtype that best matches a file. Images, videos,
 *  audio and GIFs get their own bubble treatments; everything else falls
 *  through to a generic File cell. */
export function viewtypeForFile(
  file: File,
): 'Image' | 'Video' | 'Gif' | 'Audio' | 'File' {
  if (file.type === 'image/gif') return 'Gif';
  if (file.type.startsWith('image/')) return 'Image';
  if (file.type.startsWith('video/')) return 'Video';
  if (file.type.startsWith('audio/')) return 'Audio';
  return 'File';
}
