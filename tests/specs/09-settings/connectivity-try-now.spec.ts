// Phase 9 — "Try now" reconnect button (T032 / CONNECT-006).
//
// Settings → Connectivity exposes a "Try now" button next to the title
// that calls dc-core's `maybe_network` RPC. Mirrors the reference's
// `ConnectivityToast` reconnect link.
//
// We don't drive an end-to-end "drop network, then climb back to
// CONNECTED" round-trip here because dc-core's `maybe_network` only
// interrupts running IO — it does *not* restart IO that was explicitly
// `stop_io`'d. Simulating real "stuck" connectivity (live socket that's
// silently dead) needs OS-level proxy/route hacks Playwright can't drive.
// So the test asserts the UI mechanic: button exists, click flips the
// label to "Reconnecting…" while busy, then back, and the RPC fires
// without an error.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Settings → Connectivity → Try now button calls maybe_network with busy feedback', async ({ page }) => {
  // Open Settings → Connectivity via the footer cog.
  await page.locator(TID.chatListBurger).click();
  await page.locator(TID.navTabsSettings).click();
  await page.locator(TID.settingsRailItem('connectivity')).click();
  await expect(page.locator(TID.settingsSectionBy('connectivity'))).toBeVisible();

  // Instrument the page's RPC client so the test can confirm the
  // button actually fires `maybe_network`. The SPA's `rpc` module
  // exports a singleton; we wrap its `call` method before clicking.
  await page.evaluate(() => {
    const w = window as unknown as { __mn_count?: number };
    w.__mn_count = 0;
    // Walk the global module graph the SPA exposes via `vite`'s
    // `?import` cache to monkey-patch the rpc singleton's `call`.
    // Cheap path: hijack via `WebSocket.prototype.send` and inspect
    // outgoing JSON-RPC frames. Doesn't depend on Svelte internals.
    const realSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      try {
        if (typeof data === 'string' && data.includes('"maybe_network"')) {
          w.__mn_count = (w.__mn_count ?? 0) + 1;
        }
      } catch { /* ignore */ }
      // eslint-disable-next-line prefer-rest-params
      return realSend.apply(this, arguments as unknown as [string]);
    };
  });

  const btn = page.locator(TID.settingsConnectivityTryNow);
  await expect(btn).toBeVisible();
  await expect(btn).toContainText('Try now');
  await btn.click();

  // Busy feedback: label flips to "Reconnecting…" + button disabled
  // for ~800 ms (see `tryBusy` reset in Connectivity.svelte).
  await expect(btn).toContainText(/Reconnecting/);
  await expect(btn).toBeDisabled();

  // Eventually returns to idle state.
  await expect(btn).toContainText('Try now', { timeout: 3_000 });
  await expect(btn).toBeEnabled();

  // RPC was actually sent.
  const calls = await page.evaluate(() => {
    const w = window as unknown as { __mn_count?: number };
    return w.__mn_count ?? 0;
  });
  expect(calls).toBeGreaterThan(0);
});
