// Conversions between dc-core's raw `OPENPGP4FPR:` URI scheme and qxp's
// branded `https://qxp.chat/invite/#…` landing URL.
//
// Background: the dc-core fork (`libs/deltachat-core-rust`, qxp branch)
// emits `OPENPGP4FPR:<fpr>#<params>` from `get_securejoin_qr` instead of
// upstream's `https://i.delta.chat/#…`. That URI is universal across
// every DC-compatible client's add-contact / paste input, but it's not
// a browser URL — generic phone-camera QR scanners can't open it. So
// for *sharing*, we wrap the URI into a qxp-hosted landing page URL.
//
// dc-core's `check_qr` still parses `OPENPGP4FPR:` and the historical
// `https://i.delta.chat/#…` form natively, but NOT our branded host —
// any user-pasted text that might be a qxp invite URL has to be
// rewritten back to OPENPGP4FPR before going through `check_qr`.

/** Landing-page base. Anything pasted on this host is a qxp invite. */
const QXP_INVITE_BASE = 'https://qxp.chat/invite/';
const QXP_INVITE_RE = /^https:\/\/qxp\.chat\/invite\/?#/i;
const OPENPGP4FPR_RE = /^openpgp4fpr:/i;

/**
 * Wrap a raw `OPENPGP4FPR:<fpr>#<params>` URI into a qxp-branded
 * invite landing URL. The `#` separator in OPENPGP4FPR is collapsed
 * into a `&` so the URL fragment carries one query-string-style block:
 *
 *   OPENPGP4FPR:FPR#a=ADDR&i=…   →   https://qxp.chat/invite/#FPR&a=ADDR&i=…
 *
 * Pass-through for inputs that aren't OPENPGP4FPR (already an invite
 * URL, dclogin, dcaccount, etc.).
 */
export function toQxpInviteUrl(raw: string): string {
  const m = OPENPGP4FPR_RE.exec(raw);
  if (!m) return raw;
  return `${QXP_INVITE_BASE}#${raw.slice(m[0].length).replace('#', '&')}`;
}

/**
 * Inverse of `toQxpInviteUrl`. Convert a qxp invite landing URL back to
 * the `OPENPGP4FPR:` URI before handing user-pasted text to dc-core's
 * `check_qr` (which doesn't recognise the `qxp.chat/invite` host).
 *
 * Anything that isn't a qxp invite URL passes through verbatim — dc-core
 * already accepts OPENPGP4FPR, i.delta.chat, dclogin, dcaccount, and
 * the rest of the scheme set.
 */
export function fromQxpInviteUrl(text: string): string {
  if (!QXP_INVITE_RE.test(text)) return text;
  return `OPENPGP4FPR:${text.replace(QXP_INVITE_RE, '').replace('&', '#')}`;
}
