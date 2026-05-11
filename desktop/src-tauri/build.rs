fn main() {
    // Embed Info.plist into the binary's `__TEXT,__info_plist` section on
    // macOS so that `cargo tauri dev` — which runs the unbundled executable
    // rather than the .app — still exposes NSCameraUsageDescription to the
    // OS. Without this, macOS TCC silently denies camera access before
    // getUserMedia ever reaches the WKWebView, breaking the QR scanner.
    // `tauri build` reads the same file (via the conventional location next
    // to tauri.conf.json) and merges it into the bundled Info.plist.
    #[cfg(target_os = "macos")]
    {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Info.plist");
        println!("cargo:rerun-if-changed={}", path.display());
        println!(
            "cargo:rustc-link-arg=-Wl,-sectcreate,__TEXT,__info_plist,{}",
            path.display()
        );
    }

    tauri_build::build()
}
