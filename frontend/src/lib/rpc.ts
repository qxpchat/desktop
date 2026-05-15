// Minimal JSON-RPC 2.0 client over WebSocket.
//
// Used by every state module that talks to the Rust daemon. Singleton: there
// is one connection per browser tab. Reconnects on close with exponential
// backoff; status changes fan out to subscribers so UI can show "connecting…".

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

export class RpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

class RpcClient {
  private ws: WebSocket | null = null;
  private url: string;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private statusHandlers = new Set<(s: ConnectionStatus) => void>();
  private currentStatus: ConnectionStatus = 'idle';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 0;

  constructor(url: string) {
    this.url = url;
  }

  get status(): ConnectionStatus {
    return this.currentStatus;
  }

  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.setStatus('connecting');

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.backoffMs = 0;
      this.setStatus('connected');
    });

    ws.addEventListener('message', (e) => {
      this.handleMessage(typeof e.data === 'string' ? e.data : '');
    });

    ws.addEventListener('close', (e) => {
      console.warn(`rpc: ws close code=${e.code} reason=${e.reason || '(empty)'} clean=${e.wasClean}`);
      this.failPending(new RpcError(-32000, 'connection closed'));
      this.ws = null;
      this.setStatus('disconnected');
      this.scheduleReconnect();
    });

    ws.addEventListener('error', (e) => {
      console.warn('rpc: ws error event', e);
      // Browsers don't expose details on `error`; the subsequent `close` event
      // (fired automatically by the browser) carries code/reason.
    });
  }

  call<T = unknown>(method: string, params: unknown[] | Record<string, unknown> = []): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new RpcError(-32000, 'not connected'));
    }
    const id = this.nextId++;
    const req = { jsonrpc: '2.0' as const, id, method, params };
    this.ws.send(JSON.stringify(req));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
    });
  }

  onStatus(handler: (s: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    handler(this.currentStatus); // immediate snapshot
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  private handleMessage(data: string) {
    let msg: { id?: number; result?: unknown; error?: { code: number; message: string; data?: unknown } };
    try {
      msg = JSON.parse(data);
    } catch (err) {
      console.error('rpc: invalid JSON', err);
      return;
    }
    if (typeof msg.id !== 'number') return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new RpcError(msg.error.code, msg.error.message, msg.error.data));
    else p.resolve(msg.result);
  }

  private failPending(err: RpcError) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return;
    this.backoffMs = Math.min(this.backoffMs * 2 || 500, 10_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoffMs);
  }

  private setStatus(s: ConnectionStatus) {
    if (this.currentStatus === s) return;
    this.currentStatus = s;
    for (const h of this.statusHandlers) h(s);
  }
}

/** Build the WebSocket URL the SPA should connect on.
 *
 * Three contexts:
 *   1. Plain web / Vite dev server — same-origin `/ws` (Vite proxies to the
 *      daemon during dev; an embedded production build serves it itself).
 *   2. Tauri webview — the frontend is loaded over `tauri://localhost` (no
 *      port, custom protocol). Same-origin `/ws` doesn't reach the daemon,
 *      so we hop directly to `ws://127.0.0.1:4041/ws` where the desktop
 *      shell binds it.
 */
function detectDaemonWsUrl(): string {
  const tauriHost = location.protocol === 'tauri:' || location.hostname === 'tauri.localhost';
  if (tauriHost) return 'ws://127.0.0.1:4041/ws';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export const rpc = new RpcClient(detectDaemonWsUrl());
