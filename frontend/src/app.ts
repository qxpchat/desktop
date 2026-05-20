import { mount } from 'svelte';
import { openUrl } from '@tauri-apps/plugin-opener';
import App from './shell/App.svelte';
import { initDeepLinks } from './lib/state/deepLink.svelte';
import { syncMinimizeToTray } from './lib/prefs.svelte';
import './styles/reset.css';
import './styles/tokens.css';
import './styles/theme.css';

// The 36px titlebar gutter only exists to clear macOS's traffic-light
// overlay (`titleBarStyle: 'Overlay'` in tauri.conf.json — a macOS-only
// option). On Linux/Windows native chrome supplies its own title bar, and
// in `make ui` browser mode there's no window chrome at all — so the
// gutter shows as a wasted 36px strip at the top of every pane. Zero it
// out everywhere except Tauri-on-macOS.
{
  const isTauri = '__TAURI_INTERNALS__' in window;
  const isMac =
    /Mac|Darwin/i.test(navigator.userAgent) || navigator.platform.startsWith('Mac');
  if (!(isTauri && isMac)) {
    document.documentElement.style.setProperty('--titlebar-gutter', '0px');
  }
}

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

mount(App, { target });

// Push the stored `minimizeToTray` pref to the Tauri shell so the close
// handler + tray icon match the user's choice from the previous session.
// No-op outside Tauri.
syncMinimizeToTray();

// Subscribe to OS deep links (openpgp4fpr:/dcaccount:/dclogin:/mailto:).
// Queued internally; App.svelte drains them once an account is ready.
void initDeepLinks();

// Tauri 2's WebView doesn't honor `<a target="_blank">` clicks or
// `window.open` — confirmed by the official docs (`tauri-plugin-opener`
// page) and tauri-apps/tauri issues #4756, #6172, #7285. The official
// solution is to route external URLs through `openUrl()` from
// `@tauri-apps/plugin-opener`. We intercept every `<a target="_blank">`
// click at the document level so existing callsites (chat-message
// linkify, onboarding privacy links, QR URL action, location card, …)
// work without per-link wiring.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const t = e.target;
  if (!(t instanceof Element)) return;
  const a = t.closest('a');
  if (!a) return;
  if (a.getAttribute('target') !== '_blank') return;
  if (a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (!href) return;
  if (!/^(https?|mailto):/i.test(href)) return;
  e.preventDefault();
  void openUrl(href);
});
