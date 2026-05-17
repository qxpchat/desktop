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
const DAEMON_PORT: u16 = 4041;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        // URL-scheme handler — see `plugins.deep-link` in tauri.conf.json.
        // macOS routes registered schemes here from the bundle's
        // CFBundleURLTypes; the frontend drains them via the JS plugin.
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![set_badge, clipboard_file_paths])
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

/// Set the OS taskbar/dock unread badge to `count` (0 clears it). The
/// frontend calls this every time the unread total changes.
///
/// - macOS: dock-tile badge label, capped at "99+".
/// - Linux: `com.canonical.Unity.LauncherEntry` D-Bus signal — picked up by
///   KDE, Unity, and GNOME with a Dash-to-Dock / AppIndicator extension.
/// - Windows: no-op; the frontend's title-prefix + favicon dot covers it.
#[tauri::command]
fn set_badge(count: u32) {
    #[cfg(target_os = "macos")]
    {
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
        // nil clears the bubble; an empty string paints an empty one on some
        // macOS releases.
        let ns = match count {
            0 => None,
            1..=99 => Some(NSString::from_str(&count.to_string())),
            _ => Some(NSString::from_str("99+")),
        };
        dock_tile.setBadgeLabel(ns.as_deref());
    }
    #[cfg(target_os = "linux")]
    set_unity_launcher_count(count);
    #[cfg(target_os = "windows")]
    tracing::debug!("set_badge no-op on Windows: count={count}");
}

/// Basename of our installed `.desktop` file, as `application://NAME.desktop`
/// — the app URI the Unity LauncherEntry signal targets.
///
/// GIO sets `GIO_LAUNCHED_DESKTOP_FILE` to the full path of the entry that
/// launched the process, so the URI matches whatever the running channel
/// actually installed — `qxp.desktop` for deb/rpm/Nix, the hash-mangled
/// `appimagekit_<md5>-qxp.desktop` for an integrated AppImage. Falls back to
/// `qxp.desktop` when the var is unset (e.g. launched from a terminal).
#[cfg(target_os = "linux")]
fn launcher_app_uri() -> String {
    use std::path::Path;

    let name = std::env::var_os("GIO_LAUNCHED_DESKTOP_FILE")
        .and_then(|p| Path::new(&p).file_name().map(|f| f.to_owned()))
        .and_then(|f| f.into_string().ok())
        .filter(|f| f.ends_with(".desktop"))
        .unwrap_or_else(|| "qxp.desktop".to_string());
    format!("application://{name}")
}

/// Broadcast the Unity LauncherEntry `Update` signal so the desktop shows an
/// unread count on the app icon. It's a fire-and-forget session-bus signal —
/// no service owns it; launchers/extensions listen for it.
#[cfg(target_os = "linux")]
fn set_unity_launcher_count(count: u32) {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    use zbus::zvariant::Value;

    // One session-bus connection, created lazily and reused. `None` means
    // there's no session bus (e.g. headless) — skip silently thereafter.
    static BUS: OnceLock<Option<zbus::blocking::Connection>> = OnceLock::new();
    let Some(conn) = BUS.get_or_init(|| match zbus::blocking::Connection::session() {
        Ok(c) => Some(c),
        Err(e) => {
            tracing::debug!("no session bus for launcher badge: {e}");
            None
        }
    }) else {
        return;
    };

    // The launching .desktop is fixed for the process lifetime — resolve once.
    static APP_URI: OnceLock<String> = OnceLock::new();
    let app_uri = APP_URI.get_or_init(launcher_app_uri);

    let mut props: HashMap<&str, Value> = HashMap::new();
    props.insert("count", Value::I64(count.into()));
    props.insert("count-visible", Value::Bool(count > 0));

    if let Err(e) = conn.emit_signal(
        None::<&str>,
        "/com/canonical/Unity/LauncherEntry",
        "com.canonical.Unity.LauncherEntry",
        "Update",
        &(app_uri.as_str(), props),
    ) {
        tracing::debug!("launcher badge signal failed: {e}");
    }
}

/// Absolute filesystem paths of any files currently on the clipboard — e.g.
/// files Cmd+C'd in Finder. WebKit's `paste` event only surfaces such a file
/// as a bare filename string, so the composer reads the native pasteboard
/// here to turn a pasted file into a real attachment.
///
/// macOS-only — that's the platform where the WebKit paste gap bites; other
/// platforms return an empty list and fall back to the paste event.
#[tauri::command]
fn clipboard_file_paths() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSPasteboard, NSPasteboardTypeFileURL};
        use objc2_foundation::NSURL;

        let mut paths: Vec<String> = Vec::new();
        // SAFETY: a plain read of the general pasteboard — every Objective-C
        // object handed back is autoreleased and only read from.
        unsafe {
            let pasteboard = NSPasteboard::generalPasteboard();
            let Some(items) = pasteboard.pasteboardItems() else {
                return paths;
            };
            for i in 0..items.count() {
                let item = items.objectAtIndex(i);
                let Some(url_str) = item.stringForType(NSPasteboardTypeFileURL) else {
                    continue;
                };
                let Some(url) = NSURL::URLWithString(&url_str) else {
                    continue;
                };
                if let Some(path) = url.path() {
                    paths.push(path.to_string());
                }
            }
        }
        paths
    }
    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

/// Spawn the qxp-web daemon in its own OS thread on a dedicated multi-thread
/// tokio runtime. Same wire surface as the standalone binary (axum + yerpc on
/// 127.0.0.1:4041); the only difference is that this thread exits when the
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
