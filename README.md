# qxp desktop

Native desktop app for the Delta Chat protocol. Tauri 2 shell wraps a Rust
daemon (`server/`) that bridges `deltachat-jsonrpc` to a Svelte 5 SPA
(`frontend/`) over a loopback WebSocket. Builds to a single ~15 MB binary
per OS (no Electron).

## Layout

```
server/        # Rust crate `qxp-web` — axum + yerpc + deltachat-jsonrpc.
               # Compiles to a library (used by the Tauri shell) AND
               # a standalone binary (`cargo run` for headless dev).
frontend/      # Svelte 5 + Vite + TypeScript SPA.
src-tauri/     # Tauri 2 shell crate (`qxp-desktop`).
               # Spawns the daemon in-process; opens a native window.
```

## Prerequisites

NixOS shell already wires the GTK / WebKit deps Tauri needs on Linux:

```sh
nix-shell
```

Tauri CLI (one-time, inside the shell):

```sh
cargo install tauri-cli --version "^2"
```

## Run the full app

```sh
cargo tauri dev
```

`cargo tauri dev` does three things in one command:

1. Spawns a Vite dev server at `http://localhost:4040` (hot reload).
2. Compiles the Tauri Rust shell (which spawns the daemon thread on
   `127.0.0.1:4041`).
3. Opens a native window pointing at Vite. The frontend's WebSocket
   connects to the daemon at the loopback port.

First compile takes ~10 minutes (deltachat-core); subsequent rebuilds are sub-minute.

## Production bundle

```sh
cargo tauri build
```

Outputs platform-native bundles under `src-tauri/target/release/bundle/`:

- Linux: `.AppImage`, `.deb`
- macOS: `.dmg` (unsigned by default — see notes on macOS distribution)
- Windows: `.msi` / `.exe`

The frontend is built once via `npm run build` (configured as
`beforeBuildCommand` in `tauri.conf.json`) and Tauri serves the resulting
`frontend/dist/` from `tauri://localhost` inside the bundle. The daemon
listens on `127.0.0.1:4041` exactly as in dev; the frontend detects the
Tauri context and connects there explicitly.

## Standalone daemon (headless / web-style dev)

If you just want to iterate on the Svelte UI in a regular browser without
booting Tauri:

```sh
make server   # cargo run --release-ish; daemon at 127.0.0.1:4041
make ui       # vite, 0.0.0.0:4040
```

`make ui` proxies `/ws`, `/upload`, `/file` to the daemon. Browser at
<http://localhost:4040>.

## Account data

Tauri places accounts under the per-OS app-data dir:

| OS      | Path                                                     |
| ------- | -------------------------------------------------------- |
| Linux   | `~/.local/share/chat.qxp.desktop/accounts`               |
| macOS   | `~/Library/Application Support/chat.qxp.desktop/accounts`|
| Windows | `%APPDATA%\chat.qxp.desktop\accounts`                    |

Standalone `make server` defaults to `./qxp-web-accounts/` relative to
`server/` (override with `--accounts-dir`).

## Notes on macOS distribution

The unsigned bundle works locally but Gatekeeper blocks it on first launch
for users (Settings → Privacy & Security → Open Anyway). For
friction-free distribution use **Homebrew Cask** (cask formulas auto-strip
the quarantine xattr) or pay for an Apple Developer Program account ($99 +
KYC) and signed/notarize the build. Auto-update via Tauri's updater plugin
requires a Developer ID signature.
