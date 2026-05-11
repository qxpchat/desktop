import { mount } from 'svelte';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';
import App from './shell/App.svelte';
import './styles/reset.css';
import './styles/tokens.css';
import './styles/theme.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

mount(App, { target });

// Window drag on macOS:
//   AppKit's `performWindowDragWithEvent:` needs the current `NSEvent` to be
//   the mousedown that initiated the drag. The Tauri IPC for `start_dragging`
//   is dispatched async, so by the time Rust runs it the WebView has already
//   moved past the event and the drag never starts — which is why the native
//   approach only worked on the first click (before the WebView claimed focus).
//   Tracking pointer movement ourselves and calling `setPosition` sidesteps
//   the issue entirely and works regardless of focus state.
if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  const INTERACTIVE = 'button, a, input, textarea, select, [contenteditable="true"]';
  const appWindow = getCurrentWindow();

  let drag: {
    pointerId: number;
    startX: number;
    startY: number;
    winX: number;
    winY: number;
    captureEl: HTMLElement;
  } | null = null;

  const isDragTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (!target.closest('[data-tauri-drag-region]')) return false;
    if (target.closest(INTERACTIVE)) return false;
    return true;
  };

  document.addEventListener(
    'pointerdown',
    async (e) => {
      if (e.button !== 0) return;
      if (drag) return;
      if (!isDragTarget(e.target)) return;
      const captureEl = e.target as HTMLElement;
      try {
        const pos = await appWindow.outerPosition();
        drag = {
          pointerId: e.pointerId,
          startX: e.screenX,
          startY: e.screenY,
          winX: pos.x,
          winY: pos.y,
          captureEl,
        };
        captureEl.setPointerCapture(e.pointerId);
      } catch {
        drag = null;
      }
    },
    { capture: true },
  );

  document.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.screenX - drag.startX;
      const dy = e.screenY - drag.startY;
      void appWindow.setPosition(new PhysicalPosition(drag.winX + dx, drag.winY + dy));
    },
    { capture: true },
  );

  const endDrag = (e: PointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      drag.captureEl.releasePointerCapture(drag.pointerId);
    } catch {
      /* element may be detached — releasing isn't critical */
    }
    drag = null;
  };
  document.addEventListener('pointerup', endDrag, { capture: true });
  document.addEventListener('pointercancel', endDrag, { capture: true });

  document.addEventListener('dblclick', async (e) => {
    if (!isDragTarget(e.target)) return;
    if (await appWindow.isMaximized()) await appWindow.unmaximize();
    else await appWindow.maximize();
  });
}
