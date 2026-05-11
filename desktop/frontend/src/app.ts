import { mount } from 'svelte';
import { openUrl } from '@tauri-apps/plugin-opener';
import App from './shell/App.svelte';
import './styles/reset.css';
import './styles/tokens.css';
import './styles/theme.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

mount(App, { target });

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
  if (!/^(https?|mailto|tel):/i.test(href)) return;
  e.preventDefault();
  void openUrl(href);
});
