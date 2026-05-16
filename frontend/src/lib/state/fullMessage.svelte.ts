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
      fullMessage.html = styleHtml(html);
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
