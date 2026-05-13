// Phase 13 — cross-cutting: drag-drop attach.
//
// Construct a real `File` in the page context, dispatch synthetic
// `dragenter` + `drop` events on the chat-view drop target with a
// `DataTransfer` carrying the file. The handler calls
// `uploadBlob → sendMessage(viewtype=Image)` and an outgoing bubble
// surfaces.
//
// Headless Chromium doesn't let Playwright simulate native OS-file
// drag-drop directly (no synthetic DragEvent with `dataTransfer.files`
// from the test runner). The page-side `evaluate` works around that
// by building the DataTransfer inside the page where File constructor
// is available.

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

// Tiny 1x1 PNG, base64-encoded.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';

test('drag-drop an image onto chat-view → outgoing image bubble', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await openChatByName(page, peer.displayName);

  // Build the File in the page, attach to a DataTransfer, dispatch the
  // drag-enter + drop sequence on the chat-view drop target. dragenter
  // bumps the dragDepth counter (the handler bails on plain drop with
  // depth=0) — match the production sequence.
  await page.evaluate(
    async ({ b64, target }) => {
      const bytes = atob(b64);
      const buf = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
      const file = new File([buf], 'dropped.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);

      const el = document.querySelector(target) as HTMLElement | null;
      if (!el) throw new Error(`drop target ${target} not found`);
      el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
      el.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
      el.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    },
    { b64: PNG_B64, target: TID.chatView },
  );

  // Outgoing image bubble surfaces and reaches `delivered`.
  const bubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-view-type="Image"]`,
  ).first();
  await expect(bubble).toBeVisible({ timeout: 15_000 });
  await expect(bubble).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });
});
