// Global keyboard-shortcut bus. App.svelte mounts a single window listener
// that dispatches into a shortcut name. Components register handlers via
// `onShortcut(name, handler)`.

export type ShortcutName =
  | 'new-chat'
  | 'focus-search'
  | 'in-chat-search'
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

export function bindGlobalShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      dispatchShortcut('new-chat');
    } else if (cmd && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      dispatchShortcut('focus-search');
    } else if (cmd && e.key.toLowerCase() === 'f') {
      // Only intercept if any handler is interested — otherwise let the
      // browser's native find-in-page run.
      if (dispatchShortcut('in-chat-search')) e.preventDefault();
    } else if (e.key === 'Escape') {
      dispatchShortcut('escape');
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
