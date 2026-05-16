// Per-test app fixture — spawns its own `qxp-web` daemon against a fresh
// accounts dir, navigates the browser to the Vite dev server, tears
// everything down in reverse.
//
// Use via:
//   import { test, expect } from '../../fixtures/app.js';
//   test('something', async ({ qxp, page }) => { ... });
//
// `page` is Playwright's default fixture; it's already navigated to `/`
// by the time the test body runs.

import { test as base, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname is <repo>/tests/fixtures — two up reaches the repo root.
// (The desktop app was flattened from `desktop/` to the repo root in
// commit fcbfbdc; the daemon now lives at `server/`, not `desktop/server/`.)
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DAEMON_BIN = path.join(
  REPO_ROOT,
  'server',
  'target',
  'debug',
  'qxp-web',
);
// Test daemon port — *not* the prod default (4041). Keeps the suite
// from accidentally piggy-backing on a running prod Tauri / `make
// server` instance, which would surface as onboarding specs failing
// because prod's configured account leaks in.
const DAEMON_PORT = parseInt(process.env.QXP_TEST_DAEMON_PORT ?? '9041', 10);
const DAEMON_READY_TIMEOUT_MS = 15_000;

type QxpAppFixture = {
  /** Per-test temp dir holding the daemon's account databases. */
  accountsDir: string;
  /** Port the daemon listens on (currently hardcoded to 4041). */
  daemonPort: number;
};

async function waitForDaemonReady(port: number): Promise<void> {
  const deadline = Date.now() + DAEMON_READY_TIMEOUT_MS;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        ws.once('open', () => {
          ws.close();
          resolve();
        });
        ws.once('error', reject);
      });
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(
    `daemon did not bind 127.0.0.1:${port} within ${DAEMON_READY_TIMEOUT_MS}ms: ${String(lastErr)}`,
  );
}

/** Pre-flight: confirm nothing is currently squatting on `port`. The
 *  prod Tauri shell, `make server`, and a stray test daemon all bind
 *  the same 4041 by default — without this check, `waitForDaemonReady`
 *  happily connects to whichever daemon is on the port, the test
 *  proceeds against the *wrong* accounts dir, and onboarding specs
 *  fail mysteriously when an unrelated configured account shows up.
 *  Throws with a runnable `lsof` hint if the port is taken. */
async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${port} is already in use — refusing to start the test daemon.\n` +
              `  Likely cause: prod Tauri (\`make tauri-dev\`) or \`make server\` is running.\n` +
              `  \`lsof -nP -i :${port}\` to find it; kill that process and rerun.`,
          ),
        );
      } else {
        reject(err);
      }
    });
    probe.once('listening', () => {
      probe.close((closeErr) => (closeErr ? reject(closeErr) : resolve()));
    });
    probe.listen(port, '127.0.0.1');
  });
}

export const test = base.extend<{ qxp: QxpAppFixture }>({
  // `auto: true` makes Playwright invoke this fixture for every test
  // that imports this `test`, even if the test signature doesn't
  // destructure `qxp`. Without it, lazy fixture evaluation means the
  // daemon never spawns and `page.goto('/')` never runs.
  qxp: [async ({ page }, use) => {
    // Refuse to start if the port is already in use. Prevents the
    // SPA from silently connecting to a stray daemon on the same port.
    await assertPortFree(DAEMON_PORT);

    const accountsDir = await mkdtemp(path.join(tmpdir(), 'qxp-e2e-'));
    const daemon: ChildProcess = spawn(
      DAEMON_BIN,
      ['--accounts-dir', accountsDir, '--listen', `127.0.0.1:${DAEMON_PORT}`],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    // Capture the daemon's log output. If the port is already taken
    // (most common cause: stale `make tauri-dev` / `make server` in
    // another terminal), the daemon bails with "Address already in use"
    // and we want that message in the test report rather than the
    // downstream 404 from whatever else is listening on 4041.
    let daemonLog = '';
    daemon.stderr?.on('data', (chunk) => {
      daemonLog += chunk.toString();
    });
    daemon.stdout?.on('data', (chunk) => {
      daemonLog += chunk.toString();
    });
    daemon.on('exit', (code) => {
      if (code != null && code !== 0) {
        daemonLog += `\n[daemon exited with code ${code}]`;
      }
    });

    try {
      await waitForDaemonReady(DAEMON_PORT);
    } catch (err) {
      daemon.kill();
      await rm(accountsDir, { recursive: true, force: true });
      const hint = daemonLog.includes('Address already in use')
        ? `\n\nPort ${DAEMON_PORT} is already in use. Likely cause: a stray \`make tauri-dev\` or \`make server\` is running in another terminal. \`lsof -nP -i :${DAEMON_PORT}\` to find it.`
        : daemonLog
          ? `\n\nDaemon output:\n${daemonLog}`
          : '';
      throw new Error(`${(err as Error).message}${hint}`);
    }

    // Vite-side hook for the QR-scanner stub etc. The frontend reads
    // `window.QXP_TEST_MODE` at boot (added during the data-testid
    // sweep); meanwhile, route navigation already happens here so each
    // test starts from a clean route.
    await page.addInitScript(() => {
      (window as unknown as { QXP_TEST_MODE?: boolean }).QXP_TEST_MODE = true;
    });

    // Capture browser-side errors so failing specs can attach them to
    // the diagnostic dump. We push into `(page as any).__qxpErrors`
    // because Playwright doesn't expose console history on `Page`
    // by default.
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        errors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      errors.push(`[pageerror] ${err.message}\n${err.stack ?? ''}`);
    });
    (page as unknown as { __qxpErrors: string[] }).__qxpErrors = errors;

    await page.goto('/');

    // Confirm we're actually looking at the qxp SPA, not some other
    // service squatting on :4040. Playwright's `reuseExistingServer:
    // true` will reuse *anything* responding 200 at the configured URL,
    // and Vite's `strictPort: true` means we can't fall back to another
    // port if 4040 is taken. Without this check, the smoke spec fails
    // with `#app not found` and the user has to read the diagnostic
    // dump to figure out it was a port collision.
    const title = await page.title();
    if (!/qxp/i.test(title)) {
      daemon.kill();
      await rm(accountsDir, { recursive: true, force: true });
      throw new Error(
        `Page at http://127.0.0.1:4040 doesn't look like the qxp SPA — title was "${title}". ` +
          `Something else is occupying port 4040. Run \`lsof -nP -i :4040\` to find it, then kill it.`,
      );
    }

    await use({ accountsDir, daemonPort: DAEMON_PORT });

    daemon.kill();
    await new Promise<void>((resolve) => {
      daemon.once('exit', () => resolve());
      // Force-kill after a beat if SIGTERM didn't take.
      setTimeout(() => {
        try {
          daemon.kill('SIGKILL');
        } catch {
          /* already dead */
        }
        resolve();
      }, 1_000);
    });
    await rm(accountsDir, { recursive: true, force: true });
  }, { auto: true }],
});

export { expect };
