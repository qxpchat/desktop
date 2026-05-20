//! System-tray icon. Built only when the `minimizeToTray` setting is on, and
//! only on Linux + Windows — macOS uses the dock instead. The frontend toggles
//! this on/off through the `set_minimize_to_tray` Tauri command.
//!
//! Left-clicking the tray icon toggles the main window's visibility; the
//! context menu offers Show / Quit.

use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub const TRAY_ID: &str = "main-tray";

/// Build the tray icon and register it with the app. Returns the built icon
/// (held by Tauri internally too; we only return it for error propagation).
pub fn build(app: &AppHandle) -> tauri::Result<TrayIcon> {
    let show = MenuItem::with_id(app, "tray_show", "Show qxp", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray_quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("qxp")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_event)
        .build(app)
}

/// Tear the tray icon down. No-op if it was never built.
pub fn remove(app: &AppHandle) {
    let _ = app.remove_tray_by_id(TRAY_ID);
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id.as_ref() {
        "tray_show" => show_main_window(app),
        "tray_quit" => app.exit(0),
        _ => {}
    }
}

fn handle_tray_event(tray: &TrayIcon, event: TrayIconEvent) {
    let TrayIconEvent::Click {
        button: MouseButton::Left,
        // A single click yields Down + Up; only act on Up so the toggle
        // doesn't fire twice.
        button_state: MouseButtonState::Up,
        ..
    } = event
    else {
        return;
    };
    let app = tray.app_handle();
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    // `is_focused()` would be cleaner but the tray click steals focus before
    // the event reaches us, so we key off visibility instead.
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
