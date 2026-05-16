// Pane-3 (main pane) routing. The default route is `chat`, which renders the
// active conversation if one is selected and otherwise an empty placeholder.
// Other routes overlay the chat (settings, QR, info, etc.) and are populated
// across Phases 5–22.

export type MainRoute =
  | { kind: 'chat' }
  // `code` pre-feeds a QR string into the dispatcher (skips the camera) —
  // set by the deep-link handler for openpgp4fpr:/dcaccount:/dclogin: URLs.
  | { kind: 'qrScan'; purpose: 'newContact' | 'general'; code?: string }
  | { kind: 'qrShow'; chatId?: number }
  | { kind: 'settings'; section?: string; subView?: string }
  | { kind: 'chatInfo'; chatId: number }
  | { kind: 'mediaBrowser'; chatId: number }
  | { kind: 'profileEditor' }
  | { kind: 'log' };

export const mainRoute = $state<{ route: MainRoute }>({ route: { kind: 'chat' } });

export function setMainRoute(route: MainRoute): void {
  mainRoute.route = route;
}

export function backToChat(): void {
  mainRoute.route = { kind: 'chat' };
}
