import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// During development the Vite dev server (4040) proxies the WebSocket to the
// Rust daemon. Default daemon port is 4041 (matches the prod Tauri shell);
// override with QXP_DAEMON_PORT for the E2E suite, which uses a different
// port so a prod-app session on the same machine doesn't get hijacked.
// In production builds the daemon embeds `dist/` and serves it itself,
// so no proxy is needed.
const DAEMON_PORT = parseInt(process.env.QXP_DAEMON_PORT ?? '4041', 10);

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 4040,
    strictPort: true,
    // Dev server is bound to 0.0.0.0 via `--host`; allow any Host header
    // so LAN clients (e.g. nixos.local) aren't blocked by DNS-rebind protection.
    allowedHosts: true,
    proxy: {
      '/ws': {
        target: `ws://127.0.0.1:${DAEMON_PORT}`,
        ws: true,
        changeOrigin: true,
      },
      '/upload': {
        target: `http://127.0.0.1:${DAEMON_PORT}`,
        changeOrigin: true,
      },
      '/file': {
        target: `http://127.0.0.1:${DAEMON_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
