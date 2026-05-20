// Global state for the "show full message" overlay.
//
// deltachat-core truncates message text at 38 lines × 100 chars (see
// `DC_DESIRED_TEXT_LINES` / `DC_DESIRED_TEXT_LINE_LEN` in core's
// `constants.rs`) and appends "[...]". The original is kept and exposed
// over JSON-RPC as `get_message_html`. A message whose text was truncated —
// or which carried a real HTML email part — reports `hasHtml: true`.
//
// MessageBubble shows a "Show full message" affordance for those; clicking
// it calls `openFullMessage`, which fetches the HTML and hands it to the
// FullMessageOverlay (mounted once at the app shell, like ImageLightbox).

import { rpc } from '../rpc';
import { parseInlineMarkdown } from '../format/markdown';

export type FullMessageState = {
  /** Whether the overlay is mounted. */
  open: boolean;
  /** True while the `get_message_html` RPC is in flight. */
  loading: boolean;
  /** Full message body as an HTML document, or null before it loads. */
  html: string | null;
  /** RPC failure message, or null. */
  error: string | null;
  /** Email subject of the message, shown as the overlay title. */
  subject: string;
};

export const fullMessage = $state<FullMessageState>({
  open: false,
  loading: false,
  html: null,
  error: null,
  subject: '',
});

/** Resolve a CSS custom property to a concrete `rgb(...)` string.
 *
 *  The message body renders in an iframe — a separate document, so the app's
 *  `--color-*` variables don't cross into it. `getPropertyValue` would only
 *  hand back the *declared* value (`color-mix(...)` referencing other vars
 *  that don't exist in the iframe). Painting it onto a throwaway element and
 *  reading `getComputedStyle` forces the browser to fully resolve it. */
function resolveColor(varName: string): string {
  const probe = document.createElement('div');
  probe.style.color = `var(${varName})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

/** Inject a base stylesheet into the message document so plaintext bodies
 *  render with readable typography instead of the unstyled UA serif default.
 *  Colours are pulled from the live app theme — chat-pane background and
 *  incoming-message foreground — so the overlay tracks light/dark mode.
 *  Injected last in `<head>` so a real HTML email's own styles still win. */
function styleHtml(raw: string): string {
  const bg = resolveColor('--color-bg');
  const fg = resolveColor('--color-fg');
  const accent = resolveColor('--color-accent');
  const style = `<style>
  html, body { background: ${bg}; }
  body {
    margin: 0;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    color: ${fg};
    overflow-wrap: anywhere;
  }
  a { color: ${accent}; }
  img { max-width: 100%; height: auto; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>`;
  if (raw.includes('</head>')) return raw.replace('</head>', `${style}</head>`);
  // No <head> (rare) — prepend; browsers hoist a leading <style> into head.
  return style + raw;
}

/** Core's `PlainText::to_html` wrapper — emitted byte-for-byte whenever the
 *  source was a plaintext chat message (the truncated long-message case).
 *  Real HTML emails never carry this exact prefix, so it's a precise signal
 *  for "this is a chat message wrapped in HTML, not an authored email". */
const CHAT_PLAINTEXT_PREFIX =
  '<!DOCTYPE html>\n<html><head>\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />\n<meta name="color-scheme" content="light dark" />\n</head><body>\n';

/** Apply inline markdown (`**bold**`, `_italic_`, `` `code` ``) to text
 *  inside the wrapped chat body. Core's plaintext-to-HTML wrapper only
 *  linkifies — a chat message that renders as `**bold**` in the bubble
 *  would otherwise lose its styling once expanded.
 *
 *  Skips subtrees where rewriting would corrupt content (links keep the
 *  literal text; `<code>` / `<pre>` are already verbatim). Same predicate
 *  the chat bubble uses, so the two views stay in sync. */
function applyChatMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const SKIP = new Set(['A', 'CODE', 'PRE', 'STYLE', 'SCRIPT', 'TEXTAREA']);
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let p: Node | null = node.parentNode; p && p !== doc.body; p = p.parentNode) {
        if (p.nodeType === 1 && SKIP.has((p as Element).tagName)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) targets.push(n as Text);
  for (const tn of targets) {
    const runs = parseInlineMarkdown(tn.data);
    if (runs.length === 1 && runs[0].style === null) continue;
    const frag = doc.createDocumentFragment();
    for (const run of runs) {
      if (run.style === null) {
        frag.appendChild(doc.createTextNode(run.text));
      } else {
        const tag = run.style === 'bold' ? 'strong' : run.style === 'italic' ? 'em' : 'code';
        const el = doc.createElement(tag);
        el.textContent = run.text;
        frag.appendChild(el);
      }
    }
    tn.replaceWith(frag);
  }
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

/** Open the overlay for `messageId` and fetch its full HTML body. */
export async function openFullMessage(
  accountId: number,
  messageId: number,
  subject: string,
): Promise<void> {
  fullMessage.open = true;
  fullMessage.loading = true;
  fullMessage.html = null;
  fullMessage.error = null;
  fullMessage.subject = subject;
  try {
    const html = await rpc.call<string | null>('get_message_html', [accountId, messageId]);
    // A truncated message always has a stored body; null would mean core
    // had nothing — surface that rather than showing a blank frame.
    if (html == null) {
      fullMessage.html = '';
      fullMessage.error = 'No full version available for this message.';
    } else {
      const prepared = html.startsWith(CHAT_PLAINTEXT_PREFIX) ? applyChatMarkdown(html) : html;
      fullMessage.html = styleHtml(prepared);
    }
  } catch (err) {
    fullMessage.error = err instanceof Error ? err.message : String(err);
  } finally {
    fullMessage.loading = false;
  }
}

export function closeFullMessage(): void {
  fullMessage.open = false;
  fullMessage.html = null;
  fullMessage.error = null;
  fullMessage.subject = '';
}
