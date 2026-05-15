// Tiny global state for the image / video lightbox. Any cell can call
// `openLightbox({ url, kind, caption })`; the modal is mounted once at the
// app shell level and observes this state.

export type LightboxItem = {
  url: string;
  kind: 'image' | 'video';
  caption?: string;
};

export const lightbox = $state<{ item: LightboxItem | null }>({ item: null });

export function openLightbox(item: LightboxItem): void {
  lightbox.item = item;
}

export function closeLightbox(): void {
  lightbox.item = null;
}
