// Event poll loop + dispatcher.
//
// deltachat-jsonrpc doesn't push events as JSON-RPC notifications — clients
// must poll `get_next_event_batch` (which blocks until at least one event
// arrives). We run one long-lived poll loop and fan events out to handlers
// keyed by event kind.

import { rpc } from './rpc';

export type DcEvent = {
  contextId: number;
  event: { kind: string } & Record<string, unknown>;
};

type Handler = (event: DcEvent) => void;

const handlers = new Map<string, Set<Handler>>();
let polling = false;

export function onEvent(kind: string, handler: Handler): () => void {
  let set = handlers.get(kind);
  if (!set) {
    set = new Set();
    handlers.set(kind, set);
  }
  set.add(handler);
  return () => {
    set!.delete(handler);
  };
}

export function startEventLoop(): void {
  if (polling) return;
  polling = true;
  void poll();
}

export function stopEventLoop(): void {
  polling = false;
}

async function poll(): Promise<void> {
  while (polling) {
    try {
      const batch = await rpc.call<DcEvent[]>('get_next_event_batch');
      for (const ev of batch) {
        const set = handlers.get(ev.event.kind);
        if (set) for (const h of set) h(ev);
      }
    } catch (err) {
      // Most likely WS disconnect; the rpc client's reconnect handler will
      // fire 'connected' again, which restarts this loop.
      polling = false;
      console.warn('event loop stopped:', err);
      return;
    }
  }
}
