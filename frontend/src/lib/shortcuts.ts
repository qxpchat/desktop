// Global keyboard-shortcut bus. App.svelte mounts a single window listener
// that matches a key event against the `SHORTCUTS` table and dispatches its
// name; components register handlers via `onShortcut(name, handler)`. The
// same table feeds the cheat-sheet rendered in Settings → About, so the
// displayed bindings can never drift from the ones that actually fire.

export type ShortcutName =
  | 'new-chat'
  | 'focus-search'
  | 'in-chat-search'
  | 'next-chat'
  | 'prev-chat'
  | 'open-gallery'
  | 'open-settings'
  | 'focus-composer'
  | 'escape';

const handlers = new Map<ShortcutName, Set<() => void>>();

export function onShortcut(name: ShortcutName, fn: () => void): () => void {
  let set = handlers.get(name);
  if (!set) {
    set = new Set();
    handlers.set(name, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
}

export function dispatchShortcut(name: ShortcutName): boolean {
  const set = handlers.get(name);
  if (!set || set.size === 0) return false;
  for (const fn of set) fn();
  return true;
}

const isMac =
  typeof navigator !== 'undefined' &&
  /mac/i.test(navigator.platform || navigator.userAgent || '');

/** Platform modifier label for display (⌘ on macOS, Ctrl elsewhere). */
export const modLabel = isMac ? '⌘' : 'Ctrl';

export type Shortcut = {
  name: Exclude<ShortcutName, 'escape'>;
  /** English label for the cheat sheet (wrapped in `t()` at render). */
  label: string;
  /** Display keys; `{mod}` is substituted with `modLabel`. */
  keys: string;
  /** Whether this key event triggers the shortcut. `cmd` = meta||ctrl. */
  match: (e: KeyboardEvent, cmd: boolean) => boolean;
};

// Single source of truth: matcher + display. Order matters only in that the
// first match wins (the bindings here are mutually exclusive).
export const SHORTCUTS: Shortcut[] = [
  {
    name: 'new-chat',
    label: 'New conversation',
    keys: '{mod} N',
    match: (e, cmd) => cmd && e.key.toLowerCase() === 'n',
  },
  {
    name: 'focus-search',
    label: 'Search chats',
    keys: '{mod} K',
    match: (e, cmd) => cmd && e.key.toLowerCase() === 'k',
  },
  {
    name: 'in-chat-search',
    label: 'Find in chat',
    keys: '{mod} F',
    match: (e, cmd) => cmd && e.key.toLowerCase() === 'f',
  },
  {
    name: 'next-chat',
    label: 'Next chat',
    keys: 'Alt ↓',
    match: (e) => (e.altKey && e.key === 'ArrowDown') || (e.ctrlKey && e.key === 'PageDown'),
  },
  {
    name: 'prev-chat',
    label: 'Previous chat',
    keys: 'Alt ↑',
    match: (e) => (e.altKey && e.key === 'ArrowUp') || (e.ctrlKey && e.key === 'PageUp'),
  },
  {
    name: 'open-gallery',
    label: 'Open chat gallery',
    // ⌘/Ctrl+Shift+G — plain ⌘G is conventionally "find next", so guard it
    // behind Shift to avoid the clash.
    keys: '{mod} ⇧ G',
    match: (e, cmd) => cmd && e.shiftKey && e.key.toLowerCase() === 'g',
  },
  {
    name: 'focus-composer',
    label: 'Write a message',
    // Ctrl+M on every platform (matches the reference). NOT ⌘M — that's
    // "minimize window" on macOS.
    keys: 'Ctrl M',
    match: (e) => e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'm',
  },
  {
    name: 'open-settings',
    label: 'Open settings',
    keys: '{mod} ,',
    match: (e, cmd) => cmd && e.key === ',',
  },
];

/** Display string with the platform modifier filled in. */
export function shortcutKeys(s: Shortcut): string {
  return s.keys.replace('{mod}', modLabel);
}

export function bindGlobalShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      dispatchShortcut('escape');
      return;
    }
    const cmd = e.metaKey || e.ctrlKey;
    for (const s of SHORTCUTS) {
      if (s.match(e, cmd)) {
        // Only swallow the native key if a handler actually consumed it —
        // e.g. with no chat open `in-chat-search` has no listener, so the
        // browser's find-in-page still runs.
        if (dispatchShortcut(s.name)) e.preventDefault();
        return;
      }
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
