// Global "currently-selected chat" — single source of truth. App-shell
// components and deeply-nested cells (VcardCell, search results, etc.) read
// from / write to this state instead of prop-drilling a callback chain.

export const selection = $state<{ chatId: number | null }>({ chatId: null });

export function selectChat(id: number | null): void {
  selection.chatId = id;
}
