# Development shell for qxp's desktop app (Tauri shell wrapping the daemon
# and Svelte frontend).
#
# Usage (from the repo root):
#   nix-shell
#   make server               # standalone daemon (no Tauri)
#   make ui                   # standalone Vite dev server
#   cargo tauri dev           # full Tauri shell + auto-launches Vite + daemon
#
# Targets recent nixpkgs stable. If you need a pinned Rust version, swap the
# rustc/cargo lines for fenix or rust-overlay.

{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  name = "qxp-desktop";

  packages = with pkgs; [
    # Rust toolchain. deltachat-core (transitive dep) needs recent stable.
    rustc
    cargo
    rustfmt
    clippy

    # Tauri CLI — provides `cargo tauri dev` / `cargo tauri build`.
    # Pinned via Nix so no separate `cargo install tauri-cli` step is needed.
    cargo-tauri

    # Native build tooling for deltachat-core's vendored OpenSSL + SQLite,
    # plus Tauri's gtk/webkit toolchain.
    gcc
    pkg-config
    perl
    cmake

    # Tauri / WebKitGTK runtime + buildtime deps. Without these the
    # `cargo tauri dev` build fails on missing webkit2gtk-4.1.pc / soup-3.0.
    webkitgtk_4_1
    libsoup_3
    glib
    gobject-introspection
    gtk3
    librsvg
    libayatana-appindicator
    openssl

    # Frontend
    nodejs_22

    # Local dev convenience
    gnumake
    git
  ];

  shellHook = ''
    echo "qxp desktop shell — rustc $(rustc --version | cut -d' ' -f2), node $(node --version)"
    # Help pkg-config find webkit/soup/glib/gtk .pc files for the Tauri build.
    export PKG_CONFIG_PATH=${pkgs.webkitgtk_4_1.dev}/lib/pkgconfig:${pkgs.libsoup_3.dev}/lib/pkgconfig:${pkgs.glib.dev}/lib/pkgconfig:${pkgs.gtk3.dev}/lib/pkgconfig:$PKG_CONFIG_PATH

    # WebKitGTK's DMABUF renderer shows a blank window under the Nix-store
    # libGL on NixOS. Forcing it off makes both `cargo tauri dev` and the
    # built binary render correctly. Harmless on other distros.
    export WEBKIT_DISABLE_DMABUF_RENDERER=1
  '';
}
