// Native notifications (via Tauri's notification plugin), unread badges,
// dock-tile badge on macOS, and a tab-title prefix. Wired up by
// `shell/App.svelte` once at least one account is configured.
//
// Navigation on tap is *explicit only*: clicking a notification jumps to its
// account + chat. Plain window focus / foreground does NOT navigate — an
// earlier `window.focus` heuristic guessed the "most-recently-notified" chat
// and silently switched accounts whenever the app regained focus, which
// yanked the user around on any incidental refocus. Each fired notification
// records its `{accountId, chatId}` target keyed by notification id; the tap
// callback (web `Notification.onclick`, Tauri `onAction`) looks it up and
// jumps to that exact chat.

import { invoke } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  onAction,
} from '@tauri-apps/plugin-notification';
import { rpc } from '../rpc';
import { onEvent } from '../events';
import { selectChat, selection, requestChatInAccount } from '../state/selection.svelte';
import { accounts } from '../state/accounts.svelte';
import { isAccountMuted } from '../prefs.svelte';
import { gifLabelOr } from '../gifs/giphy';
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

// Tap targets: each fired notification records its chat, keyed by the numeric
// notification id (`tagToId(tag)`). A tap looks the target up and jumps to
// exactly that chat — no "most recent" guessing, no focus heuristic. Keyed by
// id so re-notifying the same chat overwrites rather than accumulates, which
// also bounds the map to one entry per chat.
type JumpTarget = { accountId: number; chatId: number };
const notifTargets = new Map<number, JumpTarget>();

/** Switch to `accountId` (if needed) and open `chatId`. For a cross-account
 *  jump the chat target is stashed *before* flipping `accounts.selectedId`,
 *  because that flip triggers App.svelte's account-change effect; the effect
 *  drains the pending target via `consumePendingChat` instead of clearing the
 *  selection, so the chat survives the switch. */
function performJump({ accountId, chatId }: JumpTarget): void {
  if (accounts.selectedId !== accountId) {
    requestChatInAccount(accountId, chatId);
    void rpc
      .call('select_account', [accountId])
      .then(() => {
        accounts.selectedId = accountId;
      })
      .catch(() => undefined);
  } else {
    selectChat(chatId);
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
  // Tauri delivers banner taps via `onAction` (web uses `Notification.onclick`
  // below). Look the tapped notification's recorded target up by its id and
  // jump there. Fire-and-forget the async listener registration — it's a
  // no-op outside the Tauri shell.
  if (inTauri()) {
    void onAction((notification) => {
      const id = (notification as { id?: number }).id;
      if (id == null) return;
      const target = notifTargets.get(id);
      if (target) performJump(target);
    }).catch(() => undefined);
  }
  onEvent('IncomingMsg', async (ev) => {
    const accountId = ev.contextId;
    const chatId = Number(ev.event.chatId);
    const msgId = Number(ev.event.msgId);
    if (!Number.isFinite(chatId) || !Number.isFinite(msgId)) return;

    // Account-level mute (qxp-local pref). Suppresses the banner; chat-list
    // badge still counts the msg.
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
      // Giphy GIFs travel as plain-text messages whose body is the URL;
      // `gifLabelOr` swaps the cdn URL for the localised "GIF" label so the
      // banner mirrors core's "Image" / "Video" summary for real
      // attachments instead of leaking the URL.
      const summary = gifLabelOr(info.summaryText);
      // `summaryPrefix` is the sender name in groups — prepend it so the
      // body reads "Alice: hello"; in 1:1s it's null and the text stands
      // alone.
      const body = info.summaryPrefix ? `${info.summaryPrefix}: ${summary}` : summary;
      const tag = `${accountId}-${chatId}`;
      const notifId = tagToId(tag);
      notifTargets.set(notifId, { accountId, chatId });

      if (inTauri()) {
        await tauriNotify(title, body, notifId);
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = new Notification(title, { body, tag });
        n.onclick = () => {
          window.focus();
          performJump({ accountId, chatId });
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
