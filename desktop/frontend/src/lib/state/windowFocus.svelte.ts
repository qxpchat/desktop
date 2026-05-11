// Reactive flag mirroring whether the app window currently has OS focus.
// Used to decide whether to suppress in-app affordances (like the chat-row
// unread badge for the currently-open chat) — when the user has tabbed
// away to another app, "the chat is open" no longer implies they're
// actually reading the new messages, so the badge should still show.

let initial = true;
if (typeof document !== 'undefined' && typeof document.hasFocus === 'function') {
  try {
    initial = document.hasFocus();
  } catch {
    /* hasFocus throws in some edge cases (cross-origin frames); default to true */
  }
}

export const windowFocus = $state<{ focused: boolean }>({ focused: initial });

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    windowFocus.focused = true;
  });
  window.addEventListener('blur', () => {
    windowFocus.focused = false;
  });
  // `visibilitychange` covers the desktop case where the window stays
  // "focused" by the WM but the OS hides it (e.g. macOS Mission Control,
  // workspace switch). When the document is hidden we treat the app as
  // unfocused.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) windowFocus.focused = false;
    else windowFocus.focused = document.hasFocus?.() ?? true;
  });
}
