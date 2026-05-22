// Native notifications (via Tauri's notification plugin), unread badges,
// dock-tile badge on macOS, and a tab-title prefix. Wired up by
// `shell/App.svelte` once at least one account is configured.
//
// Tauri's plugin doesn't surface a "user tapped the banner" callback in v2 —
// only action-button presses. We work around that with a pending-jump queue
// that drains on `window.focus`: when macOS activates the app after a
// banner tap, the most-recently-notified chat wins. The same path covers
// dock-clicks shortly after a notification arrives, which is the standard
// Electron-app pattern.

import { invoke } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { rpc } from '../rpc';
import { onEvent } from '../events';
import { selectChat, selection } from '../state/selection.svelte';
import { accounts } from '../state/accounts.svelte';
import { isAccountMuted } from '../prefs.svelte';
import { QXP_LOGO_PATH_D, QXP_LOGO_VIEWBOX_SIZE } from '../qxpLogoPath';

const PERM_ASKED_KEY = 'qxp.web.notifPermAsked';

// Tauri context detection. In dev (Vite-only via `make ui`) the user runs
// the SPA in a regular browser — `__TAURI_INTERNALS__` is absent and we
// fall back to the web Notification API + favicon badge. Inside the
// Tauri-spawned webview the plugin is available.
//
// The Tauri JS APIs are statically imported above — `@tauri-apps/api/core`
// and `@tauri-apps/plugin-{notification,opener}` are bundled either way
// (other modules import them statically too), so the previous
// `await import(...)` dance bought no code-splitting benefit and made
// Vite emit a "dynamic import will not move module into another chunk"
// warning. The runtime plugin shims are no-ops outside the Tauri webview.
function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function tauriNotify(title: string, body: string, id: number): Promise<void> {
  const granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    if (result !== 'granted') return;
  }
  // `id` collapses repeated notifications for the same chat (newer
  // notifications replace older ones in the OS notification list).
  await sendNotification({ title, body, id });
}

/// Stable 31-bit positive id from a string — used as the numeric
/// `Options.id` since the plugin doesn't have a string `tag` field.
function tagToId(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function hasAskedPermission(): boolean {
  try {
    return localStorage.getItem(PERM_ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Trigger the OS permission prompt once, then remember we asked. Idempotent. */
export async function requestPermissionOnce(): Promise<'granted' | 'denied' | 'default'> {
  try {
    localStorage.setItem(PERM_ASKED_KEY, '1');
  } catch {
    /* private mode or quota — keep going */
  }
  if (inTauri()) {
    try {
      if (await isPermissionGranted()) return 'granted';
      return (await requestPermission()) as 'granted' | 'denied' | 'default';
    } catch {
      return 'denied';
    }
  }
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

let baseTitle = 'qxp';
let titleCaptured = false;

export function ensureBaseTitleCaptured(): void {
  if (!titleCaptured && typeof document !== 'undefined') {
    baseTitle = document.title || 'qxp';
    titleCaptured = true;
  }
}

// Pending-jump queue: each notification we fire pushes a target. When the
// window regains focus, the most-recent one wins. Entries expire so that
// dock-clicks long after a notification don't surprise the user.
type Pending = { accountId: number; chatId: number; firedAt: number };
const pendingJumps: Pending[] = [];
const PENDING_MAX_AGE_MS = 30_000;
const PENDING_FOCUS_WINDOW_MS = 8_000;

function pushPending(p: Pending): void {
  pendingJumps.push(p);
}

function drainPendingOnFocus(): void {
  const now = Date.now();
  // Drop expired entries first.
  while (pendingJumps.length > 0 && now - pendingJumps[0]!.firedAt > PENDING_MAX_AGE_MS) {
    pendingJumps.shift();
  }
  if (pendingJumps.length === 0) return;
  const target = pendingJumps[pendingJumps.length - 1]!;
  // Only jump if focus happened *shortly after* a notification — otherwise
  // a stale entry could hijack a deliberate window switch.
  if (now - target.firedAt > PENDING_FOCUS_WINDOW_MS) return;
  pendingJumps.length = 0;
  if (accounts.selectedId !== target.accountId) {
    void rpc
      .call('select_account', [target.accountId])
      .then(() => {
        accounts.selectedId = target.accountId;
        selectChat(target.chatId);
      })
      .catch(() => undefined);
  } else {
    selectChat(target.chatId);
  }
}

// Cached minimal chat-info shape (the fields we read from
// `get_basic_chat_info`). The Rust type carries more — we ignore the rest.
type BasicChat = {
  id: number;
  name: string;
  isMuted: boolean;
  isSelfTalk: boolean;
  isDeviceChat: boolean;
};

// Minimal shape of `get_message_notification_info`. `summaryPrefix` is the
// sender name (set in groups, null in 1:1s); `summaryText` is the message
// preview — body text, or a label like "Image" for media.
type NotificationInfo = {
  summaryPrefix: string | null;
  summaryText: string;
};

let notifStarted = false;
export function startIncomingNotifications(): void {
  ensureBaseTitleCaptured();
  if (notifStarted) return;
  notifStarted = true;
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', drainPendingOnFocus);
  }
  onEvent('IncomingMsg', async (ev) => {
    const accountId = ev.contextId;
    const chatId = Number(ev.event.chatId);
    const msgId = Number(ev.event.msgId);
    if (!Number.isFinite(chatId) || !Number.isFinite(msgId)) return;

    // Account-level mute (qxp-local pref). Suppresses banner + pending-jump
    // queue entry; chat-list badge still counts the msg.
    if (isAccountMuted(accountId)) return;

    // Don't notify if the user is already looking at this chat.
    const isActive =
      !document.hidden &&
      accounts.selectedId === accountId &&
      selection.chatId === chatId;
    if (isActive) return;

    try {
      const [chat, info] = await Promise.all([
        rpc.call<BasicChat>('get_basic_chat_info', [accountId, chatId]),
        rpc.call<NotificationInfo>('get_message_notification_info', [accountId, msgId]),
      ]);

      if (chat.isMuted || chat.isSelfTalk || chat.isDeviceChat) return;

      const title = chat.name || '(no name)';
      // `summaryPrefix` is the sender name in groups — prepend it so the
      // body reads "Alice: hello"; in 1:1s it's null and the text stands
      // alone. `summaryText` is the message preview (or a media label).
      const body = info.summaryPrefix
        ? `${info.summaryPrefix}: ${info.summaryText}`
        : info.summaryText;
      const tag = `${accountId}-${chatId}`;

      pushPending({ accountId, chatId, firedAt: Date.now() });

      if (inTauri()) {
        await tauriNotify(title, body, tagToId(tag));
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = new Notification(title, { body, tag });
        n.onclick = () => {
          window.focus();
          drainPendingOnFocus();
          n.close();
        };
      }
    } catch {
      /* best-effort — never let a notification path break event handling */
    }
  });
}

export function updateUnreadIndicators(unread: number): void {
  ensureBaseTitleCaptured();
  if (typeof document === 'undefined') return;
  document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${baseTitle}` : baseTitle;
  updateFavicon(unread);
  if (inTauri()) {
    void invoke('set_badge', { count: unread }).catch(() => undefined);
  }
}

let faviconLink: HTMLLinkElement | null = null;
function getFaviconLink(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null;
  if (faviconLink) return faviconLink;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  faviconLink = link;
  return link;
}

/** Cached `Path2D` for the qxp logomark — built once. */
let logoPath: Path2D | null = null;
function getLogoPath(): Path2D {
  if (!logoPath) logoPath = new Path2D(QXP_LOGO_PATH_D);
  return logoPath;
}

function updateFavicon(unread: number) {
  const link = getFaviconLink();
  if (!link) return;

  // Zero-unread: leave the static SVG favicon alone — it's sharper and
  // dynamically updates with the user's accent through `currentColor`.
  if (unread === 0) {
    link.type = 'image/svg+xml';
    link.href = '/icon.svg';
    return;
  }

  // Unread > 0: composite the qxp logo + a red badge onto a canvas, attach
  // as a PNG data URL.
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.scale(size / QXP_LOGO_VIEWBOX_SIZE, size / QXP_LOGO_VIEWBOX_SIZE);
  // Brand vertical gradient, mirroring the iOS AppIcon. The fixed colors
  // are intentional — the user-picked accent (`--color-accent`) styles
  // chrome, not the brand mark itself.
  const grad = ctx.createLinearGradient(0, 0, 0, QXP_LOGO_VIEWBOX_SIZE);
  grad.addColorStop(0, '#00FF9D');
  grad.addColorStop(1, '#22CCAA');
  ctx.fillStyle = grad;
  ctx.fill(getLogoPath());
  ctx.restore();

  const label = unread > 99 ? '99+' : String(unread);
  ctx.fillStyle = '#ff3b30';
  const cx = size - 16;
  const cy = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.font = 'bold 18px var(--font-sans, system-ui, sans-serif)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 1);

  link.type = 'image/png';
  link.href = canvas.toDataURL('image/png');
}
