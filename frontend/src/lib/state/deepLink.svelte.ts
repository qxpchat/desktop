// Deep-link handling — OS-registered URL schemes opened from outside qxp.
//
// qxp registers `openpgp4fpr:`, `dcaccount:`, `dclogin:` and `mailto:` (see
// `plugins.deep-link` in src-tauri/tauri.conf.json + the macOS bundle's
// CFBundleURLTypes). The Tauri deep-link plugin delivers a clicked link via
// `getCurrent()` (the URL the app was launched with) and `onOpenUrl()` (links
// arriving while qxp already runs).
//
// A link can arrive before an account is selected — notably on a cold start,
// where the launch URL is known before the daemon connection and account
// list have loaded. So links are queued and `drainDeepLinks()` is wired to a
// Svelte `$effect` in App.svelte: it re-fires once `accounts.selectedId` is
// set and processes whatever was waiting.

import { isTauri } from '@tauri-apps/api/core';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { setMainRoute } from './mainRoute.svelte';
import { accounts } from './accounts.svelte';
import { openChatByEmail } from '../chatActions';

const queue = $state<{ urls: string[] }>({ urls: [] });

/** Route a single deep link. Assumes an account is ready (callers gate). */
function process(url: string): void {
  const colon = url.indexOf(':');
  if (colon < 0) return;
  const scheme = url.slice(0, colon).toLowerCase();

  if (scheme === 'mailto') {
    // `mailto:addr?subject=…` / `mailto:a@x,b@y` — first address only.
    const addr = decodeURIComponent(
      url.slice(colon + 1).split('?')[0].split(',')[0],
    ).trim();
    if (addr) void openChatByEmail(addr);
    return;
  }

  // openpgp4fpr / dcaccount / dclogin — hand the whole URL to the QR
  // dispatcher, which runs it through `check_qr` exactly like a scan.
  if (scheme === 'openpgp4fpr' || scheme === 'dcaccount' || scheme === 'dclogin') {
    setMainRoute({ kind: 'qrScan', purpose: 'general', code: url });
  }
}

/** Process every queued link, if an account is ready. Reads `accounts` and
 *  `queue` reactively — drive it from an `$effect` so it re-runs when the
 *  account becomes available or a new link is queued. */
export function drainDeepLinks(): void {
  if (accounts.selectedId == null) return;
  if (queue.urls.length === 0) return;
  const pending = queue.urls;
  queue.urls = [];
  for (const url of pending) process(url);
}

/** Subscribe to OS deep links. No-op outside the Tauri shell. */
export async function initDeepLinks(): Promise<void> {
  if (!isTauri()) return;
  try {
    const launch = await getCurrent();
    if (launch && launch.length > 0) queue.urls = [...queue.urls, ...launch];
    await onOpenUrl((urls) => {
      queue.urls = [...queue.urls, ...urls];
    });
  } catch (err) {
    console.warn('deep-link init failed', err);
  }
}
