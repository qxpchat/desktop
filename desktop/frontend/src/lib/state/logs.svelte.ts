// In-memory ring buffer of log entries pulled from deltachat-core's event
// stream (`Info` / `Warning` / `Error` events). Ports the data side of
// `ios/qxp/Views/LogView.swift` — iOS reads from OSLog, here we capture the
// JSON-RPC notifications instead. The daemon's own `tracing::info!` lines
// (axum / yerpc internals) stay on stderr; for those, run `cargo tauri dev`
// in a terminal you can read.
//
// The buffer holds the most recent MAX_ENTRIES; older entries are dropped
// in bulk (rather than shifting on every push) to keep the steady-state
// cost O(1) amortized.

import { onEvent } from '../events';

export type LogLevel = 'info' | 'warning' | 'error';

export type LogEntry = {
  id: number;
  ts: Date;
  level: LogLevel;
  accountId: number;
  msg: string;
};

const MAX_ENTRIES = 2000;
const TRIM_TO = 1500;

let nextId = 1;
let started = false;

export const logs = $state<{ entries: LogEntry[] }>({ entries: [] });

function push(level: LogLevel, ev: { contextId: number; event: Record<string, unknown> }): void {
  const msg = String(ev.event.msg ?? '');
  logs.entries.push({
    id: nextId++,
    ts: new Date(),
    level,
    accountId: ev.contextId,
    msg,
  });
  if (logs.entries.length > MAX_ENTRIES) {
    logs.entries.splice(0, logs.entries.length - TRIM_TO);
  }
}

export function startLogCapture(): void {
  if (started) return;
  started = true;
  onEvent('Info', (ev) => push('info', ev));
  onEvent('Warning', (ev) => push('warning', ev));
  onEvent('Error', (ev) => push('error', ev));
  onEvent('ErrorSelfNotInGroup', (ev) => push('error', ev));
}

export function clearLogs(): void {
  logs.entries = [];
}
