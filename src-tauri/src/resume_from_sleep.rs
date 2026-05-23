//! Detect when the host machine resumes from sleep so dc-core can
//! re-evaluate connectivity. macOS WKWebView (and Linux webkitgtk) doesn't
//! reliably emit `online`/`offline` events when wifi flips or a laptop
//! wakes up — the IMAP IDLE socket stays "alive" client-side and core
//! reports the cached state until its own (long) timeouts trigger.
//!
//! Approach is the same trick the reference desktop uses: a Tokio task
//! wakes every `PROBE_INTERVAL` and checks `SystemTime`. If the wall clock
//! jumped further than the sleep duration plus a small threshold, the
//! machine likely paused — emit `qxp:resume-from-sleep` to the main webview
//! and let the frontend call `maybe_network`. `Instant` would be ideal but
//! it pauses on sleep on some OSes, so `SystemTime` is the safer source.
//!
//! No native power-state APIs (yet) — they're per-OS and bring extra deps;
//! the time-jump heuristic catches the only case that matters (sleep ≥
//! ~63 s) without any of that complexity.

use std::time::{Duration, SystemTime};

use tauri::{AppHandle, Emitter};

const PROBE_INTERVAL: Duration = Duration::from_secs(60);
/// Tolerated drift between expected and observed wake-up. Anything beyond
/// `PROBE_INTERVAL + JUMP_DETECTION_THRESHOLD` is treated as a resume.
const JUMP_DETECTION_THRESHOLD: Duration = Duration::from_secs(3);

/// Tauri event name. Frontend listens via `@tauri-apps/api/event`.
pub const RESUME_EVENT: &str = "qxp:resume-from-sleep";

pub fn start_resume_from_sleep_detector(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let threshold = PROBE_INTERVAL + JUMP_DETECTION_THRESHOLD;
        let mut last_time = SystemTime::now();
        loop {
            tokio::time::sleep(PROBE_INTERVAL).await;
            let now = SystemTime::now();
            if now
                .duration_since(last_time)
                .unwrap_or(Duration::from_secs(1))
                > threshold
            {
                tracing::info!("resume-from-sleep detected, notifying webview");
                if let Err(err) = app.emit(RESUME_EVENT, ()) {
                    tracing::warn!("failed to emit {RESUME_EVENT}: {err}");
                }
            }
            last_time = SystemTime::now();
        }
    });
}
