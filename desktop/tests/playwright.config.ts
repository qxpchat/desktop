// Playwright configuration for the qxp desktop E2E suite.
//
// Architecture:
//   - Playwright spawns the Vite dev server (via `webServer` below) and
//     keeps it alive for the whole suite. The dev server proxies `/ws`
//     to the test daemon on 127.0.0.1:`TEST_DAEMON_PORT`.
//   - Each test fixture (`fixtures/app.ts` / `fixtures/app-paired.ts`)
//     spawns its own qxp-web daemon on `TEST_DAEMON_PORT` against a
//     fresh accounts dir, kills it on teardown.
//   - Workers are pinned to 1 because the daemon port is single-valued
//     within a Vite proxy config; future work can plumb per-worker
//     ports through.
//
// Port separation: the prod Tauri shell hardcodes 4041, so we use a
// different port (default 9041) for tests. This way a developer can
// have the prod app open in the background while the suite runs —
// no collision. Override with QXP_TEST_DAEMON_PORT if 9041 conflicts
// with something on your machine.

import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_DIR = path.resolve(__dirname, '..');
const TEST_DAEMON_PORT = process.env.QXP_TEST_DAEMON_PORT ?? '9041';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 0 : 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,

  use: {
    // Explicit IPv4 — macOS resolves `localhost` to `::1` first, but Vite
    // is bound to 127.0.0.1, so navigation via the hostname hits
    // ECONNREFUSED on the IPv6 attempt and the page never loads.
    baseURL: 'http://127.0.0.1:4040',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: {
    command: 'npm --prefix frontend run dev -- --host 127.0.0.1',
    cwd: DESKTOP_DIR,
    url: 'http://127.0.0.1:4040',
    // Don't reuse — a stale Vite from a previous (prod-pointed) run
    // would proxy `/ws` to 4041 instead of the test daemon's port.
    reuseExistingServer: false,
    timeout: 60_000,
    stderr: 'pipe',
    stdout: 'ignore',
    env: {
      // Vite reads this to route `/ws` proxy to the test daemon
      // rather than the prod-default 4041.
      QXP_DAEMON_PORT: TEST_DAEMON_PORT,
      // Mint instant-onboarding accounts on Delta Chat's shared test relay
      // instead of the production qxp.chat relay. Vite exposes VITE_-prefixed
      // env vars as `import.meta.env` (see `DEFAULT_RELAY`).
      VITE_DEFAULT_RELAY: 'nine.testrun.org',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // NixOS escape hatch: Playwright's bundled Chromium can't be
        // exec'd on NixOS (wrong dynamic-loader path). When CHROMIUM_BIN
        // is set (typically `nix-shell -p chromium`), Playwright uses
        // that binary instead of its own. macOS/Windows leave this
        // unset and use the bundled Chromium as usual.
        launchOptions: process.env.CHROMIUM_BIN
          ? { executablePath: process.env.CHROMIUM_BIN }
          : {},
      },
    },
  ],
});
