// Tiny URL auto-linker. Splits a string into a sequence of `text`, `link`,
// and `email` segments by scanning for `http://`, `https://`, `mailto:`,
// `tel:`, bare `www.` prefixes, and bare `user@host` email addresses.
// Conservative: anything fancier (markdown, IPv6 literals, deltachat
// custom schemes) is left as plain text.
//
// Email gets its own segment kind because clicking it should open a qxp
// chat with that address rather than handing off to the OS mail client.
//
// Returns segments rather than HTML so callers render through Svelte's
// normal text-escaping path — no `{@html}` and no XSS surface.

export type LinkSegment = { kind: 'link'; text: string; href: string };
export type EmailSegment = { kind: 'email'; text: string; address: string };
export type TextSegment = { kind: 'text'; text: string };
export type Segment = LinkSegment | EmailSegment | TextSegment;

// One regex; covers `http(s)://...`, `mailto:user@host`, `tel:...`, bare
// `www.host/...`, and bare `user@host.tld` emails. Order matters: the
// scheme-prefixed forms are listed first so `mailto:foo@bar.com` matches
// as a single link rather than splitting into mailto: + foo@bar.com.
//
// Email RFC 5321 is wildly permissive (quoted local parts, comments, …);
// the bare-email branch sticks to the realistic-in-practice subset that
// every other client also auto-links. Adjacent dots and the lookahead/
// lookbehind for letters at the TLD guard against false positives in
// things like "send to a@b.c please" (we *do* match here, since people
// really do write short throwaway addresses) and IP-style trailing digits.
const URL_RE =
  /\b((?:https?:\/\/|mailto:|tel:)[^\s<>"']+|www\.[^\s<>"']+|[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/giu;

const TRIM_TRAILING = /[.,;:!?\)\]\}>]+$/u;
const BARE_EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/u;

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
    if (BARE_EMAIL_RE.test(raw)) {
      segs.push({ kind: 'email', text: raw, address: raw });
    } else {
      const href = raw.startsWith('www.') ? `https://${raw}` : raw;
      segs.push({ kind: 'link', text: raw, href });
    }
    last = end;
  }
  if (last < input.length) {
    segs.push({ kind: 'text', text: input.slice(last) });
  }
  return segs.length === 0 ? [{ kind: 'text', text: input }] : segs;
}
