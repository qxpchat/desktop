// Global state for the image / video lightbox. Any cell calls
// `openLightbox({ url, kind, caption, msgId })`; the modal is mounted once
// at the app shell level and observes this state.
//
// Opening from a chat image also pulls the chat's full image/video gallery
// so the lightbox's ← / → arrows step through every adjacent photo — the
// gallery build is async and lands after the clicked item is already shown.

import { rpc } from '../rpc';
import { fileUrl } from '../files';
import { chat, loadMessages } from './chat.svelte';

export type LightboxItem = {
  url: string;
  kind: 'image' | 'video';
  caption?: string;
  /** Source message id — anchors the item within the chat gallery. */
  msgId?: number;
};

export const lightbox = $state<{ items: LightboxItem[]; index: number }>({
  items: [],
  index: 0,
});

export function closeLightbox(): void {
  lightbox.items = [];
  lightbox.index = 0;
}

/** Step the gallery by `delta` (wraps around). No-op when nothing is open. */
export function lightboxStep(delta: number): void {
  const n = lightbox.items.length;
  if (n === 0) return;
  lightbox.index = (lightbox.index + delta + n) % n;
}

export async function openLightbox(item: LightboxItem): Promise<void> {
  // Paint the clicked item immediately; the gallery fills in below.
  lightbox.items = [item];
  lightbox.index = 0;

  const active = chat.active;
  if (active == null || item.msgId == null) return;

  try {
    // Same media set as the Media browser's Gallery tab.
    const ids = await rpc.call<number[]>('get_chat_media', [
      active.accountId,
      active.chatId,
      'Image',
      'Gif',
      'Video',
    ]);
    if (ids.length <= 1) return;

    const msgs = await loadMessages(active.accountId, ids);
    // Oldest → newest so ← walks back in time, → walks forward.
    msgs.sort((a, b) => a.timestamp - b.timestamp);
    const gallery: LightboxItem[] = msgs
      .filter((m) => m.file)
      .map((m) => ({
        url: fileUrl(m.file ?? undefined) ?? '',
        kind: m.viewType === 'Video' ? 'video' : 'image',
        caption: m.text || undefined,
        msgId: m.id,
      }));

    const idx = gallery.findIndex((g) => g.msgId === item.msgId);
    if (idx < 0) return;

    // Bail if the lightbox was closed or re-opened on a different image
    // while the gallery was loading.
    if (lightbox.items.length !== 1 || lightbox.items[0].msgId !== item.msgId) {
      return;
    }
    lightbox.items = gallery;
    lightbox.index = idx;
  } catch {
    /* gallery fetch failed — keep the single-item view */
  }
}
