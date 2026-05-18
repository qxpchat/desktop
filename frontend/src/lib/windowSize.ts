import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

// Matches `minHeight` in src-tauri/tauri.conf.json — `setMinSize` takes
// both dimensions, so the height floor is passed through unchanged.
const MIN_WINDOW_HEIGHT = 480;

/** Pin the OS window's minimum width so it can't be resized narrow enough
 *  to squeeze the chat pane below its minimum. If the window is already
 *  narrower than `minWidth`, grow it to fit. No-op outside the Tauri shell
 *  (headless `make ui` runs in a plain browser with no window controls). */
export async function syncWindowMinWidth(minWidth: number): Promise<void> {
  if (!isTauri()) return;
  try {
    const win = getCurrentWindow();
    await win.setMinSize(new LogicalSize(minWidth, MIN_WINDOW_HEIGHT));
    if (window.innerWidth < minWidth) {
      await win.setSize(new LogicalSize(minWidth, window.innerHeight));
    }
  } catch (err) {
    console.warn('syncWindowMinWidth failed', err);
  }
}
