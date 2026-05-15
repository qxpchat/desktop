// YouTube URL detection. Returns the 11-char video ID if the text contains a
// recognisable YouTube link, otherwise null. Pure function — no network.

const PATTERNS: RegExp[] = [
  // youtube.com / m.youtube.com / music.youtube.com /watch?v=ID (with any
  // ordering of other query parameters).
  /(?:^|[^\w])(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^\s&]+&)*v=([A-Za-z0-9_-]{11})/i,
  // youtu.be/ID short links.
  /(?:^|[^\w])(?:https?:\/\/)?(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})/i,
  // /shorts/ID
  /(?:^|[^\w])(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
  // /embed/ID
  /(?:^|[^\w])(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
];

export function detectYouTubeId(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const p of PATTERNS) {
    const m = p.exec(text);
    if (m) return m[1];
  }
  return null;
}
