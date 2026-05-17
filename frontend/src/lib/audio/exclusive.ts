/** The single media element currently playing, app-wide. */
let current: HTMLMediaElement | null = null;

/**
 * Svelte action — only one media element plays at a time. When the element
 * fires `play`, any other element still playing is paused. Covers both
 * `<audio>` (recorded voice, attached audio) and `<video>`.
 *
 * A capture-phase `document` listener would avoid per-element wiring, but
 * WKWebView (the macOS WebView) dispatches media events only at the target
 * — they don't propagate to `document` in either phase — so the listener
 * has to sit on the element itself.
 */
export function exclusiveMedia(el: HTMLMediaElement) {
  function onPlay() {
    if (current && current !== el) current.pause();
    current = el;
  }
  el.addEventListener('play', onPlay);
  return {
    destroy() {
      el.removeEventListener('play', onPlay);
      if (current === el) current = null;
    },
  };
}
