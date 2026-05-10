// Browser notifications + favicon badge + page-title prefix.
// Wired up by App.svelte once an account is configured. Phase 17 deliverable.

import { rpc } from '../rpc';
import { onEvent } from '../events';
import { selectChat, selection } from '../state/selection.svelte';
import { accounts } from '../state/accounts.svelte';
import { QXP_LOGO_PATH_D, QXP_LOGO_VIEWBOX_SIZE } from '../qxpLogoPath';

const PERM_ASKED_KEY = 'qxp.web.notifPermAsked';

export function hasAskedPermission(): boolean {
  try {
    return localStorage.getItem(PERM_ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

export async function requestPermissionOnce(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    const result = await Notification.requestPermission();
    localStorage.setItem(PERM_ASKED_KEY, '1');
    return result;
  } catch {
    return 'denied';
  }
}

let baseTitle = 'qxp';
let started = false;

export function ensureBaseTitleCaptured(): void {
  if (!started && typeof document !== 'undefined') {
    baseTitle = document.title || 'qxp';
    started = true;
  }
}

export function startIncomingNotifications(): void {
  ensureBaseTitleCaptured();
  onEvent('IncomingMsg', async (ev) => {
    const accountId = ev.contextId;
    const chatId = Number(ev.event.chatId);
    const msgId = Number(ev.event.msgId);
    if (!Number.isFinite(chatId) || !Number.isFinite(msgId)) return;

    const isActive =
      !document.hidden &&
      accounts.selectedId === accountId &&
      selection.chatId === chatId;
    if (isActive) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    try {
      const map = await rpc.call<Record<number, { kind: string }>>('get_messages', [
        accountId,
        [msgId],
      ]);
      const r = map[msgId] as
        | { kind: 'message'; text?: string; sender?: { displayName?: string } }
        | { kind: 'loadingError' }
        | undefined;
      if (!r || r.kind !== 'message') return;
      const sender = r.sender?.displayName ?? 'New message';
      const body = r.text ?? '';
      const tag = `${accountId}-${chatId}`;
      const n = new Notification(sender, { body, tag });
      n.onclick = () => {
        window.focus();
        if (accounts.selectedId !== accountId) {
          void rpc
            .call('select_account', [accountId])
            .then(() => {
              accounts.selectedId = accountId;
              selectChat(chatId);
            })
            .catch(() => undefined);
        } else {
          selectChat(chatId);
        }
        n.close();
      };
    } catch {
      /* notification best-effort */
    }
  });
}

export function updateUnreadIndicators(unread: number): void {
  ensureBaseTitleCaptured();
  if (typeof document === 'undefined') return;
  document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${baseTitle}` : baseTitle;
  updateFavicon(unread);
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

  const accent =
    getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() ||
    '#22ccaa';

  ctx.save();
  ctx.scale(size / QXP_LOGO_VIEWBOX_SIZE, size / QXP_LOGO_VIEWBOX_SIZE);
  ctx.fillStyle = accent;
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
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 1);

  link.type = 'image/png';
  link.href = canvas.toDataURL('image/png');
}
