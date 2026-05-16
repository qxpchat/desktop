// Per-test fixture for *pre-paired* specs.
//
// Drop-in replacement for `fixtures/app.ts` (the empty-accounts variant)
// that:
//
//   1. Leases a pre-paired pair from `account-templates/`.
//   2. Copies both daemon snapshots into per-test mkdtemp dirs.
//   3. Spawns the main daemon on 4041 against the copied dir, so the
//      Vite proxy still finds it.
//   4. Spawns the peer daemon on PEER_PORT (4042 by default), starts IO.
//   5. Navigates the page — the SPA finds an already-configured account
//      and lands on the chat shell directly. No UI login.
//
// Tests using this fixture skip both `manualLogin` *and*
// `pairPeerWithMain` — that's the speedup. The peer is returned with
// `pairedChatId` already set, so `peer.sendTo` immediately uses the
// verified-1on1 chat (no fallback to create-contact + send).

import { test as base, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, cp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import {
  leasePair,
  releasePair,
  type PairTemplate,
  type PoolAccount,
} from './accounts.js';
import { RpcClient } from './daemon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname is <repo>/tests/fixtures — two up reaches the repo root.
// (Desktop app flattened from `desktop/` to repo root in commit fcbfbdc.)
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DAEMON_BIN = path.join(
  REPO_ROOT, 'server', 'target', 'debug', 'qxp-web',
);
// Test daemon ports — separated from prod's 4041/4042 so the suite
// doesn't piggy-back on a running prod app.
const MAIN_PORT = parseInt(process.env.QXP_TEST_DAEMON_PORT ?? '9041', 10);
const PEER_PORT = parseInt(process.env.QXP_TEST_PEER_PORT ?? '9042', 10);
const DAEMON_READY_TIMEOUT_MS = 15_000;

export type PairedPeer = {
  daemon: ChildProcess;
  daemonPort: number;
  rpc: RpcClient;
  accountId: number;
  email: string;
  displayName: string;
  pairedChatId: number;
  /** Send `text` into the paired chat (verified-1on1 with main).
   *  Returns the new message id on the peer side — Phase 13's
   *  jump-from-quote spec uses it to thread a `quotedMessageId` into
   *  a follow-up send. */
  sendTo(text: string): Promise<number>;
  /** Send a structured message (file / location / vcard / voice) into
   *  the paired chat. */
  sendAttachment(data: {
    viewtype: 'Text' | 'Image' | 'Gif' | 'Video' | 'Audio' | 'Voice' | 'File' | 'Vcard';
    file?: string;
    filename?: string;
    text?: string;
    location?: [number, number];
  }): Promise<number>;
  /** Mark fresh incoming messages on peer's side as seen — emits MDN
   *  back to main, advancing main's outgoing bubble to `read`. */
  markSeen(timeoutMs?: number): Promise<void>;
};

export type QxpPairedFixture = {
  /** Slot info for main (already logged in / configured in the daemon). */
  mainAccount: PoolAccount;
  /** Live JSON-RPC client connected to the main daemon. Tests that
   *  need to manipulate main from outside the UI (e.g. provision a
   *  second account in Phase 8) use this. The fixture owns the
   *  lifecycle and closes it on teardown. */
  mainRpc: RpcClient;
  /** Pre-paired peer handle. */
  peer: PairedPeer;
  /** Per-test temp dir holding the copied main accounts dir. */
  mainAccountsDir: string;
  /** Per-test temp dir holding the copied peer accounts dir. */
  peerAccountsDir: string;
};

async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${port} is already in use — refusing to start the test daemon.\n` +
              `  Likely cause: prod Tauri (\`make tauri-dev\`) or a stray test daemon.\n` +
              `  \`lsof -nP -i :${port}\` to find it.`,
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

async function waitForDaemonReady(port: number): Promise<void> {
  const deadline = Date.now() + DAEMON_READY_TIMEOUT_MS;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        ws.once('open', () => { ws.close(); resolve(); });
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

function spawnQxpWeb(port: number, accountsDir: string): { proc: ChildProcess; log: () => string } {
  let logBuf = '';
  const proc = spawn(
    DAEMON_BIN,
    ['--accounts-dir', accountsDir, '--listen', `127.0.0.1:${port}`],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  proc.stderr?.on('data', (chunk) => { logBuf += chunk.toString(); });
  proc.stdout?.on('data', (chunk) => { logBuf += chunk.toString(); });
  proc.on('exit', (code) => {
    if (code != null && code !== 0) logBuf += `\n[daemon exited with code ${code}]`;
  });
  return { proc, log: () => logBuf };
}

async function killAndWait(proc: ChildProcess): Promise<void> {
  proc.kill();
  await new Promise<void>((resolve) => {
    if (proc.exitCode != null) { resolve(); return; }
    proc.once('exit', () => resolve());
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      resolve();
    }, 1_000);
  });
}

async function startPairedPeer(
  port: number,
  accountsDir: string,
  template: PairTemplate,
): Promise<PairedPeer> {
  const { proc, log } = spawnQxpWeb(port, accountsDir);
  try {
    await waitForDaemonReady(port);
  } catch (err) {
    proc.kill();
    throw new Error(`peer daemon failed to bind ${port}:\n${log()}\n${(err as Error).message}`);
  }

  const rpc = new RpcClient(`ws://127.0.0.1:${port}/ws`);
  await rpc.connect();

  // The template's account already has addr/mail_pw/displayname/mdns_enabled
  // configured. We just need the account id (templates always end up at
  // account id 1 since the dir starts empty before configure), and to
  // start IO.
  const ids = await rpc.call<number[]>('get_all_account_ids');
  const accountId = ids[0];
  if (accountId == null) {
    proc.kill();
    throw new Error('peer template had no configured account on load');
  }
  await rpc.call('select_account', [accountId]);
  await rpc.call('start_io', [accountId]);

  const email = await rpc.call<string>('get_config', [accountId, 'addr']);
  const displayName = template.peer.displayName;
  const pairedChatId = template.peerPairedChatId;

  const peer: PairedPeer = {
    daemon: proc,
    daemonPort: port,
    rpc,
    accountId,
    email,
    displayName,
    pairedChatId,
    async sendTo(text) {
      // Returns the newly-created message id on peer's side. Tests that
      // need to quote-reply (Phase 13 jump-from-quote) read it; everyone
      // else ignores it.
      return await rpc.call<number>('misc_send_text_message', [
        accountId,
        pairedChatId,
        text,
      ]);
    },
    async sendAttachment(data) {
      return await rpc.call<number>('send_msg', [accountId, pairedChatId, data]);
    },
    async markSeen(timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const fresh = await rpc.call<number[]>('get_fresh_msgs', [accountId]);
        if (fresh.length > 0) {
          await rpc.call('markseen_msgs', [accountId, fresh]);
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    },
  };
  return peer;
}

export const test = base.extend<{ qxpPaired: QxpPairedFixture }>({
  qxpPaired: [async ({ page }, use) => {
    // Refuse to start if either port is squatted (prod app / stray daemon).
    await assertPortFree(MAIN_PORT);
    await assertPortFree(PEER_PORT);

    const pair = await leasePair();

    const mainAccountsDir = await mkdtemp(path.join(tmpdir(), `qxp-paired-main-`));
    const peerAccountsDir = await mkdtemp(path.join(tmpdir(), `qxp-paired-peer-`));

    // Copy the snapshotted dbs over the fresh mkdtemp. `cp` with recursive
    // descends into accounts/<id>/dc.db and the per-account blobdir.
    await Promise.all([
      cp(pair.mainTemplateDir, mainAccountsDir, { recursive: true }),
      cp(pair.peerTemplateDir, peerAccountsDir, { recursive: true }),
    ]);

    // Start main on the well-known port the Vite proxy targets.
    const { proc: mainProc, log: mainLog } = spawnQxpWeb(MAIN_PORT, mainAccountsDir);
    try {
      await waitForDaemonReady(MAIN_PORT);
    } catch (err) {
      mainProc.kill();
      await rm(mainAccountsDir, { recursive: true, force: true });
      await rm(peerAccountsDir, { recursive: true, force: true });
      releasePair(pair);
      const hint = mainLog().includes('Address already in use')
        ? `\n\nPort ${MAIN_PORT} is already in use. Likely cause: a stray \`make tauri-dev\` or \`make server\` is running in another terminal. \`lsof -nP -i :${MAIN_PORT}\` to find it.`
        : '';
      throw new Error(`${(err as Error).message}${hint}\n${mainLog()}`);
    }

    // Bring up the peer daemon and grab its handle.
    let peer: PairedPeer;
    const mainRpc = new RpcClient(`ws://127.0.0.1:${MAIN_PORT}/ws`);
    try {
      peer = await startPairedPeer(PEER_PORT, peerAccountsDir, pair);
      // start_io on main so it processes incoming MDN-traffic from peer.
      await mainRpc.connect();
      const ids = await mainRpc.call<number[]>('get_all_account_ids');
      if (ids[0] != null) {
        await mainRpc.call('select_account', [ids[0]]);
        await mainRpc.call('start_io', [ids[0]]);
      }
    } catch (err) {
      mainRpc.close();
      await killAndWait(mainProc);
      await rm(mainAccountsDir, { recursive: true, force: true });
      await rm(peerAccountsDir, { recursive: true, force: true });
      releasePair(pair);
      throw err;
    }

    // Record browser-side errors per the standard pattern.
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

    await page.addInitScript(() => {
      (window as unknown as { QXP_TEST_MODE?: boolean }).QXP_TEST_MODE = true;
    });
    await page.goto('/');

    // SPA boots, refreshAccounts finds the configured account, selects it,
    // chatlist mounts. Wait for the shell to actually be visible —
    // otherwise specs race against onboarding-vs-shell branching.
    await page.waitForSelector('[data-testid="app-shell"]', { timeout: 20_000 });

    await use({
      mainAccount: pair.main,
      mainRpc,
      peer,
      mainAccountsDir,
      peerAccountsDir,
    });

    // Teardown.
    mainRpc.close();
    peer.rpc.close();
    await Promise.all([
      killAndWait(peer.daemon),
      killAndWait(mainProc),
    ]);
    await Promise.all([
      rm(mainAccountsDir, { recursive: true, force: true }),
      rm(peerAccountsDir, { recursive: true, force: true }),
    ]);
    releasePair(pair);
  }, { auto: true }],
});

export { expect };
export type { Page };
