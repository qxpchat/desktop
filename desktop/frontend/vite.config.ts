import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// During development the Vite dev server (8080) proxies the WebSocket to the
// Rust daemon (9090). In production builds the daemon will embed `dist/` and
// serve it itself, so no proxy will be needed.
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 8080,
    strictPort: true,
    // Dev server is bound to 0.0.0.0 via `--host`; allow any Host header
    // so LAN clients (e.g. nixos.local) aren't blocked by DNS-rebind protection.
    allowedHosts: true,
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:9090',
        ws: true,
        changeOrigin: true,
      },
      '/upload': {
        target: 'http://127.0.0.1:9090',
        changeOrigin: true,
      },
      '/file': {
        target: 'http://127.0.0.1:9090',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
