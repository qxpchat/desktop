// Single entry point for "copy this to the clipboard, give the user
// confirmation". Centralises the try/catch + toast wiring so call sites
// don't reinvent it (and don't drift in whether they show feedback at
// all — see git history of QrShow / AddSecondDevice / ShareProxy, which
// each had a local `copied` flag + setTimeout doing the same thing).
//
// When `toastMessage` is omitted, the copy is silent — appropriate for
// context-menu items where dismissing the menu is itself the feedback.
// The boolean return lets callers that need to swap to an error UI
// (ShareProxy's "Could not copy to clipboard." line) react to denial.

import { showToast } from './state/toast.svelte';

export async function copyToClipboard(
  text: string,
  toastMessage?: string,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    if (toastMessage) showToast(toastMessage);
    return true;
  } catch {
    return false;
  }
}
