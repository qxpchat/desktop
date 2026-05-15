// Named timeouts. Centralised so specs can reference a meaning, not a number,
// and so we can dial individual phases up/down without sed-ing 200 specs.

/** Time we wait for a message sent from peer→main to surface as a bubble.
 *  Chatmail delivery is fast (<5s typical) but not deterministic — heavier
 *  payloads (gif, video, mp4) plus IMAP IDLE wake-up latency push p99
 *  above 30s in practice. 60s leaves headroom without slowing the
 *  happy path (green tests don't approach this). */
export const ARRIVAL_TIMEOUT_MS = 60_000;

/** Time we wait for an outgoing message's state glyph to reach `delivered`.
 *  Distinct from arrival — we're observing local SMTP+relay round-trip,
 *  not the peer-side IMAP poll. Media attachments specifically take
 *  longer on chatmail than text. */
export const DELIVERED_TIMEOUT_MS = 45_000;

/** Time we wait for the chat list to populate after onboarding completes. */
export const CHATLIST_READY_MS = 10_000;

/** Time we wait for the Tauri shell to mount and render the first frame.
 *  Includes the daemon spawn + WebSocket connect + Svelte first paint. */
export const APP_READY_MS = 20_000;

/** Polling interval for `waitUntil`-style assertions. Short enough to feel
 *  responsive, long enough that we don't peg the CPU. */
export const POLL_INTERVAL_MS = 100;

/** Per-test timeout — caps how long any single `it()` can run. Phase 16
 *  visual specs override to something larger. */
export const SPEC_TIMEOUT_MS = 60_000;
