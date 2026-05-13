// Per-test fixture for *pre-paired trio* specs.
//
// Same idea as `app-paired.ts` but with two pre-paired peers instead of
// one. Used by Phase 2 chatlist specs that need to seed two distinct
// chats (`load-and-sort`, `pin`, `search`). Skips the per-test live
// secure_join handshake for the second peer entirely — that was the
// single biggest source of flakes (30-150s, relay-dependent).
//
// Port layout:
//   main  : QXP_TEST_DAEMON_PORT  (default 9041, what the Vite proxy hits)
//   peer1 : QXP_TEST_PEER_PORT    (default 9042)
//   peer2 : QXP_TEST_PEER2_PORT   (default 9043)

import { test as base, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, cp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import {
  leaseTrio,
  releaseTrio,
  type PoolAccount,
} from './accounts.js';
import { RpcClient } from './daemon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DAEMON_BIN = path.join(
  REPO_ROOT, 'desktop', 'server', 'target', 'debug', 'qxp-web',
);
const MAIN_PORT = parseInt(process.env.QXP_TEST_DAEMON_PORT ?? '9041', 10);
const PEER1_PORT = parseInt(process.env.QXP_TEST_PEER_PORT ?? '9042', 10);
const PEER2_PORT = parseInt(process.env.QXP_TEST_PEER2_PORT ?? '9043', 10);
const DAEMON_READY_TIMEOUT_MS = 15_000;

export type TrioPeer = {
  daemon: ChildProcess;
  daemonPort: number;
  rpc: RpcClient;
  accountId: number;
  email: string;
  displayName: string;
  pairedChatId: number;
  sendTo(text: string): Promise<number>;
  markSeen(timeoutMs?: number): Promise<void>;
};

export type QxpTrioFixture = {
  mainAccount: PoolAccount;
  mainRpc: RpcClient;
  peer1: TrioPeer;
  peer2: TrioPeer;
  mainAccountsDir: string;
  peer1AccountsDir: string;
  peer2AccountsDir: string;
};

async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${port} is already in use — refusing to start the test daemon.\n` +
            `  Likely cause: prod Tauri or a stray test daemon.\n` +
            `  \`lsof -nP -i :${port}\` to find it.`,
        ));
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

async function startTrioPeer(
  port: number,
  accountsDir: string,
  account: PoolAccount,
  pairedChatId: number,
): Promise<TrioPeer> {
  const { proc, log } = spawnQxpWeb(port, accountsDir);
  try {
    await waitForDaemonReady(port);
  } catch (err) {
    proc.kill();
    throw new Error(`trio peer daemon failed to bind ${port}:\n${log()}\n${(err as Error).message}`);
  }

  const rpc = new RpcClient(`ws://127.0.0.1:${port}/ws`);
  await rpc.connect();

  const ids = await rpc.call<number[]>('get_all_account_ids');
  const accountId = ids[0];
  if (accountId == null) {
    proc.kill();
    throw new Error('trio peer template had no configured account on load');
  }
  await rpc.call('select_account', [accountId]);
  await rpc.call('start_io', [accountId]);

  const email = await rpc.call<string>('get_config', [accountId, 'addr']);
  const displayName = account.displayName;

  return {
    daemon: proc,
    daemonPort: port,
    rpc,
    accountId,
    email,
    displayName,
    pairedChatId,
    async sendTo(text) {
      return await rpc.call<number>('misc_send_text_message', [accountId, pairedChatId, text]);
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
}

export const test = base.extend<{ qxpTrio: QxpTrioFixture }>({
  qxpTrio: [async ({ page }, use) => {
    await assertPortFree(MAIN_PORT);
    await assertPortFree(PEER1_PORT);
    await assertPortFree(PEER2_PORT);

    const trio = await leaseTrio();
    const mainAccountsDir = await mkdtemp(path.join(tmpdir(), `qxp-trio-main-`));
    const peer1AccountsDir = await mkdtemp(path.join(tmpdir(), `qxp-trio-peer1-`));
    const peer2AccountsDir = await mkdtemp(path.join(tmpdir(), `qxp-trio-peer2-`));

    await Promise.all([
      cp(trio.mainTemplateDir, mainAccountsDir, { recursive: true }),
      cp(trio.peer1TemplateDir, peer1AccountsDir, { recursive: true }),
      cp(trio.peer2TemplateDir, peer2AccountsDir, { recursive: true }),
    ]);

    const { proc: mainProc, log: mainLog } = spawnQxpWeb(MAIN_PORT, mainAccountsDir);
    try {
      await waitForDaemonReady(MAIN_PORT);
    } catch (err) {
      mainProc.kill();
      await rm(mainAccountsDir, { recursive: true, force: true });
      await rm(peer1AccountsDir, { recursive: true, force: true });
      await rm(peer2AccountsDir, { recursive: true, force: true });
      releaseTrio(trio);
      throw new Error(`${(err as Error).message}\n${mainLog()}`);
    }

    let peer1: TrioPeer | null = null;
    let peer2: TrioPeer | null = null;
    const mainRpc = new RpcClient(`ws://127.0.0.1:${MAIN_PORT}/ws`);
    try {
      peer1 = await startTrioPeer(PEER1_PORT, peer1AccountsDir, trio.peer1, trio.peer1PairedChatId);
      peer2 = await startTrioPeer(PEER2_PORT, peer2AccountsDir, trio.peer2, trio.peer2PairedChatId);
      await mainRpc.connect();
      const ids = await mainRpc.call<number[]>('get_all_account_ids');
      if (ids[0] != null) {
        await mainRpc.call('select_account', [ids[0]]);
        await mainRpc.call('start_io', [ids[0]]);
      }
    } catch (err) {
      mainRpc.close();
      if (peer1) { peer1.rpc.close(); await killAndWait(peer1.daemon); }
      if (peer2) { peer2.rpc.close(); await killAndWait(peer2.daemon); }
      await killAndWait(mainProc);
      await rm(mainAccountsDir, { recursive: true, force: true });
      await rm(peer1AccountsDir, { recursive: true, force: true });
      await rm(peer2AccountsDir, { recursive: true, force: true });
      releaseTrio(trio);
      throw err;
    }

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
    await page.waitForSelector('[data-testid="app-shell"]', { timeout: 20_000 });

    await use({
      mainAccount: trio.main,
      mainRpc,
      peer1: peer1!,
      peer2: peer2!,
      mainAccountsDir,
      peer1AccountsDir,
      peer2AccountsDir,
    });

    mainRpc.close();
    peer1!.rpc.close();
    peer2!.rpc.close();
    await Promise.all([
      killAndWait(peer1!.daemon),
      killAndWait(peer2!.daemon),
      killAndWait(mainProc),
    ]);
    await Promise.all([
      rm(mainAccountsDir, { recursive: true, force: true }),
      rm(peer1AccountsDir, { recursive: true, force: true }),
      rm(peer2AccountsDir, { recursive: true, force: true }),
    ]);
    releaseTrio(trio);
  }, { auto: true }],
});

export { expect };
export type { Page };
