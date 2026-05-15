// Phase 13 — cross-cutting: paste-to-attach.
//
// Synthesize a `paste` ClipboardEvent carrying an image File and dispatch it
// on the composer textarea. The handler stages the image as the composer's
// pending attachment (the preview row above the textarea); clicking send
// delivers it. Non-image pastes fall through to the default text paste.
//
// Headless Chromium can't inject a real OS clipboard, so the page-side
// `evaluate` builds the ClipboardEvent directly — same workaround as the
// drag-drop spec.

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

// Tiny 1x1 PNG, base64-encoded.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';

test('paste an image into the composer → stages, then send → outgoing image bubble', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await openChatByName(page, peer.displayName);

  await page.evaluate(
    ({ b64, target }) => {
      const bytes = atob(b64);
      const buf = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
      const file = new File([buf], 'image.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);

      const el = document.querySelector(target) as HTMLElement | null;
      if (!el) throw new Error(`paste target ${target} not found`);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    },
    { b64: PNG_B64, target: TID.composerTextarea },
  );

  // The paste stages the image as the pending attachment — not sent yet.
  await expect(page.locator(TID.composerAttachmentBar)).toBeVisible();

  await page.locator(TID.composerSend).click();

  const bubble = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-view-type="Image"]`,
  ).first();
  await expect(bubble).toBeVisible({ timeout: 15_000 });
  await expect(bubble).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });

  // Pending attachment is cleared after send.
  await expect(page.locator(TID.composerAttachmentBar)).not.toBeVisible();
});
