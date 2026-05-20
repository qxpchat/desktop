// Lightweight global toast — one slot, last-write-wins. `showToast(msg)`
// from anywhere; `<Toast />` mounted once in the app shell renders it and
// auto-dismisses after `TOAST_MS`. Newer toasts replace older ones (the
// timer resets), which is the desired UX for things like
// "Address copied to clipboard" — a rapid double-click shouldn't queue a
// second banner.

const TOAST_MS = 2000;

export const toast = $state<{ message: string | null }>({ message: null });

let timer: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string): void {
  toast.message = message;
  if (timer != null) clearTimeout(timer);
  timer = setTimeout(() => {
    toast.message = null;
    timer = null;
  }, TOAST_MS);
}
