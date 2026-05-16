// Headless qxp-web daemon helper.
//
// The `qxp` fixture (`fixtures/app.ts`) spawns the daemon that the SPA
// under test talks to. This helper covers everything *else*: setup-only
// daemons that produce artifacts (backup .tar files, backup-pair QR
// strings, pre-populated chat state) before the test runs.
//
// Each helper spawns qxp-web on a non-default port and exposes a minimal
// JSON-RPC client. Same wire protocol as the prod daemon — same auth,
// same errors. The chatmail relay sees these as ordinary clients.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname is <repo>/tests/fixtures — two up reaches the repo root.
// (Desktop app flattened from `desktop/` to repo root in commit fcbfbdc;
// the daemon now lives at `server/`, not `desktop/server/`.)
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DAEMON_BIN = path.join(
  REPO_ROOT,
  'server',
  'target',
  'debug',
  'qxp-web',
);

export class RpcClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(private url: string) {}

  async connect(): Promise<void> {
    this.ws = new WebSocket(this.url);
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        this.ws!.off('error', onErr);
        resolve();
      };
      const onErr = (err: Error) => {
        this.ws!.off('open', onOpen);
        reject(err);
      };
      this.ws!.once('open', onOpen);
      this.ws!.once('error', onErr);
    });
    this.ws.on('message', (data: Buffer | string) => this.handle(data.toString()));
  }

  private handle(data: string): void {
    let msg: { id?: number; result?: unknown; error?: { code: number; message: string } };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof msg.id !== 'number') return; // notifications ignored
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
    else p.resolve(msg.result);
  }

  call<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    if (!this.ws) return Promise.reject(new Error('rpc not connected'));
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    return new Promise<T>((resolve, reject) =>
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      }),
    );
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}

export type TempDaemon = {
  port: number;
  accountsDir: string;
  rpc: RpcClient;
  shutdown(): Promise<void>;
};

const DAEMON_READY_TIMEOUT_MS = 15_000;

/** Spawn an isolated qxp-web on `port` with a fresh accounts dir. The
 *  returned RPC client is connected and ready. Caller is responsible for
 *  calling `shutdown()` (handles both the daemon process and the temp dir).
 *
 *  Pick a port that doesn't collide with `fixtures/app.ts`'s main daemon
 *  (which uses 4041). 4042+ is the convention. */
export async function spawnTempDaemon(port: number): Promise<TempDaemon> {
  const accountsDir = await mkdtemp(path.join(tmpdir(), 'qxp-tmp-daemon-'));
  const proc: ChildProcess = spawn(
    DAEMON_BIN,
    ['--accounts-dir', accountsDir, '--listen', `127.0.0.1:${port}`],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  // Wait for the WebSocket to accept connections.
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
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (lastErr !== undefined) {
    proc.kill();
    await rm(accountsDir, { recursive: true, force: true });
    throw new Error(`temp daemon did not bind 127.0.0.1:${port}: ${String(lastErr)}`);
  }

  const rpc = new RpcClient(`ws://127.0.0.1:${port}/ws`);
  await rpc.connect();

  const shutdown = async () => {
    rpc.close();
    proc.kill();
    await new Promise<void>((resolve) => {
      proc.once('exit', () => resolve());
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          /* already dead */
        }
        resolve();
      }, 1_000);
    });
    await rm(accountsDir, { recursive: true, force: true });
  };

  return { port, accountsDir, rpc, shutdown };
}

/** Configure an account on a temp daemon using existing chatmail creds
 *  (typically a leased pool slot). Returns the daemon-side accountId. */
export async function configureAccount(
  daemon: TempDaemon,
  email: string,
  password: string,
): Promise<number> {
  const accountId = await daemon.rpc.call<number>('add_account');
  await daemon.rpc.call('set_config', [accountId, 'addr', email]);
  await daemon.rpc.call('set_config', [accountId, 'mail_pw', password]);
  await daemon.rpc.call('configure', [accountId]);
  return accountId;
}
