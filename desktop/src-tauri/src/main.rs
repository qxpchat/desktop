// Prevents an extra OS-level console window from spawning on Windows release
// builds. No-op on Linux / macOS.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

use tauri::Manager;
use tracing_subscriber::EnvFilter;

/// Loopback port the daemon binds. Hard-coded so the Vite proxy and the
/// frontend's relative `/ws` URL resolve to the same place that the bundled
/// daemon listens on. The port is deliberately the same as the standalone
/// `make server` setup — the Tauri app behaves identically to running the
/// daemon by hand.
const DAEMON_PORT: u16 = 9090;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![set_badge])
        .setup(|app| {
            // Per-OS app data dir — `~/.local/share/chat.qxp.desktop` on Linux,
            // `~/Library/Application Support/chat.qxp.desktop` on macOS,
            // `%APPDATA%\chat.qxp.desktop` on Windows. Accounts go inside.
            let accounts_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| anyhow::anyhow!("could not resolve app data dir: {e}"))?
                .join("accounts");

            spawn_daemon(accounts_dir);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Set the macOS dock-tile badge to `label` (e.g. "3", "99+", or empty to
/// clear). The frontend calls this every time the unread total changes.
/// No-op on non-macOS — the badge concept doesn't exist on Linux/Windows
/// taskbars in a portable way; flashing the icon would be a separate path.
#[tauri::command]
fn set_badge(label: Option<String>) {
    #[cfg(target_os = "macos")]
    {
        use objc2::msg_send;
        use objc2_app_kit::NSApplication;
        use objc2_foundation::{MainThreadMarker, NSString};

        // dockTile must be touched on the main thread. The Tauri invoke
        // handler already runs on the main thread for `#[tauri::command]`
        // fns by default, but we re-prove it to satisfy MainThreadMarker.
        let Some(mtm) = MainThreadMarker::new() else {
            tracing::warn!("set_badge invoked off the main thread; skipping");
            return;
        };
        let app = NSApplication::sharedApplication(mtm);
        let dock_tile = app.dockTile();
        let text = label.as_deref().unwrap_or("");
        let ns = NSString::from_str(text);
        unsafe {
            let _: () = msg_send![&*dock_tile, setBadgeLabel: &*ns];
        }
    }
    // Silence unused-arg warning on non-macOS.
    let _ = label;
}

/// Spawn the qxp-web daemon in its own OS thread on a dedicated multi-thread
/// tokio runtime. Same wire surface as the standalone binary (axum + yerpc on
/// 127.0.0.1:9090); the only difference is that this thread exits when the
/// Tauri process does.
fn spawn_daemon(accounts_dir: PathBuf) {
    std::thread::Builder::new()
        .name("qxp-daemon".into())
        .spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("daemon tokio runtime");

            let listen = format!("127.0.0.1:{DAEMON_PORT}")
                .parse()
                .expect("hard-coded loopback addr parses");

            tracing::info!(
                "starting daemon at 127.0.0.1:{DAEMON_PORT}, accounts at {}",
                accounts_dir.display()
            );

            if let Err(err) = rt.block_on(qxp_web::run(qxp_web::DaemonConfig {
                listen,
                accounts_dir,
            })) {
                tracing::error!("daemon exited with error: {err:#}");
            }
        })
        .expect("failed to spawn daemon thread");
}
