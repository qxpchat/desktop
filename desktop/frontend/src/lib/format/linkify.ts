// Tiny URL auto-linker. Splits a string into a sequence of `text` and `link`
// segments by scanning for `http://`, `https://`, `mailto:`, `tel:`, and
// bare `www.` prefixes. Conservative: anything fancier (markdown, IPv6
// literals, email addresses without `mailto:`, deltachat custom schemes)
// is left as plain text.
//
// Returns segments rather than HTML so callers render through Svelte's
// normal text-escaping path — no `{@html}` and no XSS surface.

export type LinkSegment = { kind: 'link'; text: string; href: string };
export type TextSegment = { kind: 'text'; text: string };
export type Segment = LinkSegment | TextSegment;

// One regex; covers `http(s)://...`, `mailto:user@host`, `tel:...`, and
// bare `www.host/...`. Trailing punctuation (like `.`, `,`, `)` etc.) is
// trimmed off the matched URL after the fact.
const URL_RE =
  /\b((?:https?:\/\/|mailto:|tel:)[^\s<>"']+|www\.[^\s<>"']+)/giu;

const TRIM_TRAILING = /[.,;:!?\)\]\}>]+$/u;

export function linkify(input: string): Segment[] {
  if (!input) return [];
  const segs: Segment[] = [];
  let last = 0;
  for (const match of input.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let raw = match[0];

    // Drop trailing punctuation that's almost certainly not part of the URL.
    const trimmed = raw.replace(TRIM_TRAILING, '');
    raw = trimmed;
    const end = start + raw.length;

    if (start > last) {
      segs.push({ kind: 'text', text: input.slice(last, start) });
    }
    const href = raw.startsWith('www.') ? `https://${raw}` : raw;
    segs.push({ kind: 'link', text: raw, href });
    last = end;
  }
  if (last < input.length) {
    segs.push({ kind: 'text', text: input.slice(last) });
  }
  return segs.length === 0 ? [{ kind: 'text', text: input }] : segs;
}
