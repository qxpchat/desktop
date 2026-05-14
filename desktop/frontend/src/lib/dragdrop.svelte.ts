// Tauri 2 routes OS-level file drops through a per-webview event stream when
// `dragDropEnabled: true` (see `desktop/src-tauri/tauri.conf.json`). HTML
// `ondrop` is unreliable on macOS WKWebView even with the flag off — drag
// over fires but the actual drop never reaches JS. Going through Tauri's
// event also hands us OS paths directly, so we can pass them straight to
// `send_msg` (deltachat-core copies into the blobdir) without an HTTP upload
// round-trip.

import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { onDestroy } from 'svelte';

export type DropState = 'idle' | 'over';

export type DropZoneOpts = {
  /** Lazy accessor so the helper can hit-test against the live DOM ref. */
  el: () => HTMLElement | null;
  onDrop: (paths: string[]) => void | Promise<void>;
  onState?: (state: DropState) => void;
};

/** Register the current Svelte component as a drag-drop target. Hit-tests
 *  Tauri's window-wide drag events against `el`'s bounding box and dispatches
 *  drops that land inside. No-op outside Tauri (e.g. `make ui` web mode). */
export function dropZone({ el, onDrop, onState }: DropZoneOpts): void {
  if (!isTauri()) return;

  let unlisten: (() => void) | null = null;
  let alive = true;

  void getCurrentWebview()
    .onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === 'leave') {
        onState?.('idle');
        return;
      }
      const target = el();
      if (!target) {
        onState?.('idle');
        return;
      }
      // Tauri reports positions in physical pixels; the DOM rect is in CSS.
      const dpr = window.devicePixelRatio || 1;
      const x = p.position.x / dpr;
      const y = p.position.y / dpr;
      const r = target.getBoundingClientRect();
      const inside =
        x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

      if (p.type === 'drop') {
        onState?.('idle');
        if (inside) void onDrop(p.paths);
      } else {
        onState?.(inside ? 'over' : 'idle');
      }
    })
    .then((un) => {
      if (alive) unlisten = un;
      else un();
    });

  onDestroy(() => {
    alive = false;
    unlisten?.();
  });
}
