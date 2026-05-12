# PLAN: Desktop App (qxp) — full-scope port

> **2026-05-10 pivot:** the original "self-hostable web client" framing has
> been replaced with a native desktop app via Tauri 2. The folder formerly
> at `web/` is now `desktop/`, and contains the same daemon (`server/`) and
> Svelte SPA (`frontend/`) plus a new Tauri shell at `desktop/src-tauri/`.
> The phase content below was authored under the web-client framing — it
> all still applies, since the Tauri shell wraps the same surface — but
> read "self-hostable web client" as "desktop app" and "make server / make
> ui in two terminals" as "cargo tauri dev in one terminal".



## Mission

Port the qxp iOS app to the browser as a self-hostable, single-binary web client: a Rust daemon (axum + yerpc + `deltachat-jsonrpc`) that serves a Svelte 5 + TypeScript SPA over a localhost WebSocket. Feature parity with the iOS app — onboarding, chats, groups, channels, attachments, voice, location, reactions, message actions, media browser, QR/verification, multi-account, settings, connectivity, drafts — adapted to a desktop-browser three-pane shell modelled on Signal Desktop. Local-machine only for this plan; deployment, packaging and distribution are deferred to a follow-up plan.

## Architecture

### Stack

- **Frontend:** Svelte 5 (runes) + TypeScript + Vite, built as a static SPA.
- **Backend:** Rust crate `qxp-web` linking `deltachat-jsonrpc` directly (not as a child process). HTTP + WebSocket via `axum`. JSON-RPC framing via `yerpc` (the same framework deltachat-rpc-server uses), upgraded over WebSocket. Static assets embedded with `rust-embed`.
- **Wire format:** JSON-RPC 2.0 over WebSocket on `/ws`. TypeScript types are generated from `deltachat-jsonrpc`'s OpenRPC schema (the same generator used by `deltachat-desktop`). Server-pushed events (incoming msg, msgs changed, etc.) are JSON-RPC notifications.
- **Database / state:** lives entirely inside the deltachat core's accounts directory (`DC_ACCOUNTS_PATH` equivalent — env var or `--accounts-dir` flag). No qxp-web state outside it.
- **Browser target:** latest Chrome / Firefox / Safari (≈ last 2 stable versions). No legacy / IE / mobile-browser polish in this plan.
- **Zero runtime dependencies in the binary** beyond what `deltachat-jsonrpc` and `axum` already pull in. Frontend deps limited to Svelte, Vite, TypeScript, and the `@deltachat/jsonrpc-client` types package (or hand-rolled equivalent) — nothing else without an explicit justification in the phase that adds it.

### Repo layout

```
web/
├── server/                        # Rust crate `qxp-web`
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                # CLI args, listen address, accounts dir
│       ├── ws.rs                  # WebSocket upgrade → yerpc handler
│       ├── rpc.rs                 # bridge to deltachat-jsonrpc Accounts + event fan-out
│       └── assets.rs              # rust-embed of frontend/dist
├── frontend/                      # Svelte 5 + Vite SPA
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── app.ts
│       ├── lib/
│       │   ├── rpc.ts             # JSON-RPC client + event subscription
│       │   ├── generated/         # auto-generated TS types from deltachat-jsonrpc
│       │   └── state/             # Svelte runes: Accounts, ChatList, Chat, etc.
│       ├── shell/                 # NavTabs, ChatList pane, ChatView pane, splitter
│       ├── chat/                  # MessageBubble, InputBar, attachments, reactions
│       ├── compose/               # New chat / group / channel
│       ├── settings/              # Chats, appearance, relays, blocked, etc.
│       ├── qr/                    # Show + scan
│       └── onboarding/            # Welcome, instant, manual, backup
└── README.md                      # local dev instructions only
```

`web/` is a sibling to `ios/` and `libs/`. Cargo workspace setup decided in Phase 0.

### JSON-RPC wiring

```
 Browser                                  Daemon
 ┌──────────────────┐  WebSocket (JSON)   ┌──────────────────────────────────┐
 │ Svelte SPA       │ ◄────────────────► │ axum + yerpc                     │
 │  rpc.ts client   │   request /         │  ↕                               │
 │  state stores    │   response /        │ deltachat-jsonrpc :: Accounts    │
 │  components      │   notification      │  ↕                               │
 │                  │                     │ libdeltachat (Rust core)         │
 └──────────────────┘                     └──────────────────────────────────┘
```

- One WebSocket per browser tab. Multiple tabs sharing one daemon is allowed (deltachat-jsonrpc handles concurrent callers); each tab gets its own emitter subscription so events don't cross-talk.
- Frontend never speaks IMAP/SMTP/HTTP-to-mail-providers itself — the daemon owns the network.
- Server-side push: deltachat events are pushed as JSON-RPC notifications; the frontend `rpc.ts` exposes them as a typed event stream that Svelte stores subscribe to.

### Three-pane shell

Modelled on Signal Desktop's left-rail / chat-list / conversation layout but tailored to multi-account Delta Chat:

```
┌───────┬─────────────────┬────────────────────────────────────────┐
│ Profs │ Chat list       │ Chat view (or settings / QR / info)    │
│  ●    │  ┌─Search ───┐  │  ┌─ Title bar (avatar, name, status)─┐ │
│  ●    │  │ filter…   │  │  │                                   │ │
│  ●    │  └───────────┘  │  ├─ Message scroll ──────────────────┤ │
│  ●    │  ▢ Alice       7m  │   bubbles, reactions, replies     │ │
│  +    │  ▢ Project chat 3h │                                    │ │
│       │  ▢ Dad           y │   ┌─ Composer ──────────────────┐ │ │
│       │  …                 │   │ 📎  Type a message…    🎙 ➤│ │ │
│       │                  │   └─────────────────────────────┘  │ │
│       │                  │                                    │ │
└───────┴─────────────────┴────────────────────────────────────────┘
  pane 1     pane 2                       pane 3
  collapses  collapses to avatars         always visible
  fully
```

- **Pane 1 — Profiles / accounts.** Vertical strip of avatar buttons, one per configured account, plus an "add account" tile. Selected account is highlighted; per-account unread badge overlays each avatar (sums fresh msgs across that account's chats). Pane is collapsible to zero width via a chevron toggle in the splitter (or a top-of-pane button) — when collapsed it shows nothing; the selected account avatar moves into pane 2's header instead.
- **Pane 2 — Chat list.** Search input at top, archived / settings / QR entry rows below, then the chatlist (`dc_get_chatlist`) sorted by last activity. Collapsible to a narrow strip showing only avatars (≈ 56 px), in which case the row click still selects the chat into pane 3 and a tooltip shows the name. The pane uses a finite state machine modelled on Signal's `LeftPaneHelper`: `inbox` (default), `search`, `compose`, `chooseMembers`, `setGroupMetadata`, `archive`. Each state owns its own header / list rendering inside the same pane footprint.
- **Pane 3 — Main content.** Default = the selected chat (or empty placeholder). Routes also for: settings, QR show/scan, contact info, group info, media browser, blocked contacts, relays, log view, profile editor. Pane 3 is always visible; on narrow viewports pane 2 may overlay it (deferred — see Out of scope).
- **Splitter.** Drag-to-resize between panes 1/2 and 2/3, with min/max widths persisted to `localStorage` (Signal Desktop's `useMove` + `getWidthFromPreferredWidth` is the inspiration; our implementation is fresh, no port).

## Reference behaviour

### iOS feature inventory

Drawn from `ios/qxp/` source survey + the archived plans under `plans/` (MVP, onboarding, groups, qr, in-chat-media-browser, msg-funcs, notifications, connectivity, chats-settings, errors, share-extension, push-notifications). Every feature below is implemented or planned in iOS today; the web phases below map 1:1 unless a phase is explicitly noted as "deferred from web v1".

- **Onboarding:** Welcome splash → Sign Up (instant chatmail) / Manual setup (IMAP+SMTP) / Restore Backup (file) / Add as Second Device (QR-paired transfer). Provider QR scan inside instant onboarding (`DC_QR_LOGIN`/`DC_QR_ACCOUNT`) and during scan-dispatch.
- **Multi-account:** profile list, switch active account, per-account unread, add/remove account, account-level settings.
- **Chat list:** search, pinned/archived sections, swipe actions (pin, mute, archive, delete), unread badges, pull-to-refresh equivalent.
- **Compose flow:** search contacts, "New Contact" (QR), "New Group", "New Channel" (broadcast list); 1:1 chats created via `dc_create_chat_by_contact_id`.
- **1:1 chat view:** message history, send text, message states (pending/delivered/read/failed glyphs), receive in real-time on events, mark-noticed on open, scroll-to-bottom button, auto-scroll on new.
- **Group chats / channels:** name, avatar, description, verified flag, member list, add / remove / leave; channels are outgoing broadcasts.
- **Attachments:** images, gifs, videos, documents, voice messages (record + waveform playback), location (one-shot + live streaming), contact (vcard), media quality picker, auto-download size limit.
- **Reactions:** quick row of common emoji + full picker with search / recents / categories.
- **Message actions:** reply (quote), forward, edit (own outgoing text), delete, copy, swipe-to-reply, "(edited)" indicator.
- **Media browser:** in-chat tabs Gallery / Audio / Files, tap to preview, Show-in-Chat / Share / Delete context menu.
- **Chat / contact info:** rename, change avatar/description, verified badge, manage members, mute, pin, archive, ephemeral timer, leave/delete, block/unblock contact, group QR invite.
- **QR tab:** show own securejoin QR, share invite link (`https://i.delta.chat/#…`), copy, paste, withdraw/revive; scanner dispatch over the full `DC_QR_*` matrix.
- **Settings:**
  - Appearance (theme, accent color, wallpaper).
  - Chats and Media (blocked contacts, media quality, auto-download, read receipts, auto-delete device + server).
  - Relays (proxy management + connectivity status).
  - Backup (export, transfer pair).
  - Profile (display name, avatar).
  - About, Log view.
- **Connectivity:** real-time status, quota display, last-sent message status.
- **Notifications + badges:** local banners on incoming msgs in non-active chats, app-icon badge equivalent, per-account / global counts.
- **Drafts:** per-chat draft text, persisted; reply-quote draft and edit-mode draft.
- **Localization:** strings reused from `references/deltachat-ios/deltachat-ios/en.lproj/Localizable.strings` (semantics, not file).
- **Voice / Live Location / Webxdc:** voice in scope; live location in scope; webxdc apps explicitly deferred (iOS doesn't ship them yet either — see Open questions).

### Signal Desktop left-rail observations

From `references/signal-desktop/ts/components/`:

- `NavSidebar.dom.tsx` owns the resizable left container, persists `preferredLeftPaneWidth`, computes `WidthBreakpoint` (narrow / wide), and renders `NavTabs` next to its `children` (the active pane). `useMove` (from `react-aria`) drives the splitter; `MIN_WIDTH` / `MIN_FULL_WIDTH` / `MAX_WIDTH` constants define behaviour.
- `NavTabs.dom.tsx` is the icon-strip rail: tabs (chats / calls / stories / settings) with an avatar at the bottom. Each tab carries an `unreadStats` badge. The whole rail collapses on a `navTabsCollapsed` boolean.
- `LeftPane.dom.tsx` is a finite state machine — its `mode` enum (`inbox | search | archive | compose | findByUsername | findByPhoneNumber | chooseGroupMembers | setGroupMetadata`) selects a `LeftPaneHelper` which controls the header, the list contents, and the bottom action bar. The pane re-renders the same chrome but different bodies.
- `ConversationListItem.dom.tsx` renders a row given a `BaseConversationListItem` shape (avatar, name, lastMessage, timestamp, badges).
- We do not import any Signal code; observations inform the FSM-shaped pane 2 and the resizable splitter.

### Delta Chat reference clients

- `references/deltachat-ios/` — UIKit reference for behaviour (we already follow this in iOS; web reuses the same observations through the existing iOS plans).
- `references/Signal-iOS/` — present in the tree but iOS-only; not consulted for the web port.
- `libs/deltachat-core-rust/deltachat-rpc-server/`, `libs/deltachat-core-rust/deltachat-jsonrpc/` — JSON-RPC API surface. We **link the `deltachat-jsonrpc` crate**; we do **not** spawn `deltachat-rpc-server` as a child process.

## Constraints (inherited + web-specific)

- No invented behaviour. Every JSON-RPC call exists in `deltachat-jsonrpc`; if a method is missing, surface as an open question rather than re-implementing on the client.
- Modern browsers only. No IE / legacy-Edge / pre-2024 Safari shims.
- Zero npm deps beyond Svelte / Vite / TypeScript / generated RPC types unless an individual phase justifies an addition. No CSS framework — plain CSS modules / `:global()` scoped styles. No icon library — inline SVG (or one tiny self-managed sprite).
- 100 % Rust backend. No node-side rendering, no Electron wrapper, no Tauri.
- Local-machine only. The daemon binds `127.0.0.1:<port>` by default; nothing in this plan opens it to other hosts. Reverse proxy / TLS / multi-user auth is the deployment plan's problem.
- Plain WebSocket (no SSE, no long-poll). Reconnect with exponential backoff is the frontend `rpc.ts`'s job.
- Verification per phase must be possible from a normal dev shell + browser. No iOS Simulator, no Xcode, no signed apps.
- Plans for non-trivial design decisions live inline in the relevant phase; we don't flip ahead to deployment / packaging while feature work is underway.

---

## Phase 0 — Workspace + daemon skeleton + RPC bridge ✅ DONE (2026-05-10)

**Outcome:** `web/server/` is a standalone Rust crate (`qxp-web`) using axum 0.8 + the yerpc re-export from `deltachat-jsonrpc` (path-dep into `libs/deltachat-core-rust/deltachat-jsonrpc`). `src/main.rs` parses CLI flags via clap (`--listen`, `--accounts-dir`), opens an `Accounts` against the on-disk dir, builds a `CommandApi`, and serves axum routes `GET /` (placeholder index) and `GET /ws` (WebSocket upgrade); shutdown calls `accounts.stop_io()` on Ctrl-C. `src/ws.rs` runs the per-connection bridge: `tokio::select!` between `RpcClient` outbound stream and inbound WS frames, spawning `session.handle_incoming` per request. `src/{rpc.rs,assets.rs}` are placeholder modules awaiting later phases. `web/frontend/` is a Vite 6 + Svelte 5 + TypeScript SPA; `App.svelte` opens the WS, calls `get_system_info`, and renders the response with `$state` runes. `web/Makefile` exposes `make server` (daemon, `127.0.0.1:9090`) and `make ui` (Vite, `0.0.0.0:8080`, LAN-accessible via `--host`). `web/shell.nix` provides a NixOS dev shell (rustc/cargo/clippy/rustfmt + gcc/pkg-config/perl/cmake for the vendored OpenSSL/SQLite build + Node 22 + gnumake/git). `web/.gitignore` excludes `server/target/`, `frontend/{node_modules,dist}/`, and the local `qxp-web-accounts/` dir.

**Gotchas:**
- `deltachat-jsonrpc` is **not published to crates.io** — switched from `"=2.49.0"` to `{ path = "../../libs/deltachat-core-rust/deltachat-jsonrpc" }`. Cargo resolves the crate's `workspace = true` inheritance via the inner `deltachat-core-rust` workspace; this works because our top-level `web/server` package has no outer workspace declaration of its own.
- `@sveltejs/vite-plugin-svelte` must be `^5` (not `^4`) to peer-match Vite 6.
- Vite blocks unknown `Host` headers under DNS-rebind protection when bound to 0.0.0.0; `vite.config.ts` now has `allowedHosts: true` so `nixos.local` (or any LAN hostname) works alongside `--host`.
- First `cargo run` takes ~10 minutes — compiles the entire deltachat core. Subsequent builds are sub-minute.

**Goal:** A `cargo run` from `web/server/` brings up an axum server at `127.0.0.1:9090` that (a) serves a stubbed `index.html` from disk, (b) accepts WebSocket connections at `/ws`, and (c) routes JSON-RPC calls into a real `deltachat-jsonrpc::Accounts` instance backed by a temp accounts directory.

### Scope

- Cargo workspace decision: add `web/server/Cargo.toml` as a standalone crate referencing `deltachat-jsonrpc` from `libs/deltachat-core-rust/deltachat-jsonrpc/` via path. (No root workspace yet — the iOS side has none. Revisit if a second Rust crate appears under `web/`.)
- axum 0.7+ with `tokio` runtime; `axum::extract::ws` for WebSocket upgrade.
- `yerpc` integration: re-use the same wiring `deltachat-rpc-server` does over stdio, but plug it into the WebSocket sink/stream pair instead.
- One global `Accounts` instance per daemon process (pinned via `OnceCell` or similar). Concurrent WebSocket clients call into it through `yerpc` independently.
- Event emitter fanned out per-client subscription; emitter is constructed per WebSocket and `unref`'d on disconnect.
- Minimal `web/frontend/` Vite + Svelte 5 scaffold: `index.html`, `app.ts`, one Svelte component that opens a WebSocket to `/ws` (proxied by Vite to `127.0.0.1:9090`), calls the JSON-RPC `get_system_info` (or whatever is the simplest no-arg method), and renders the result as JSON.
- Basic CLI: `--listen <addr:port>`, `--accounts-dir <path>` (default `$XDG_DATA_HOME/qxp-web/accounts`).

### Files / dirs created

- `web/server/Cargo.toml`, `web/server/src/{main.rs,ws.rs,rpc.rs,assets.rs}` (assets.rs may be empty until Phase 1).
- `web/frontend/{package.json,vite.config.ts,tsconfig.json,index.html,src/app.ts,src/main.svelte}`.
- `web/README.md` — local dev instructions.

### Steps

1. Add `deltachat-jsonrpc` to the new Rust crate's deps via path. Confirm it builds (this is the long first-time core compile — gate user expectations).
2. Wire up the smallest possible axum app: `GET /` → `index.html`, `GET /ws` → WebSocket upgrade.
3. In `ws.rs`: on upgrade, construct a `yerpc::RpcSession` against the global `Accounts`, spawn a task that pumps `Accounts::get_event_emitter()` events as JSON-RPC notifications, and forward bidirectional frames between WS and yerpc.
4. Vite scaffold: minimal Svelte 5 SPA with one component that calls `get_system_info` and dumps the result.
5. Add `web/README.md` with the two-shell dev workflow (`cargo run` + `npm run dev` with Vite proxying `/ws`).

### Verification

- `cd web/server && cargo run --` starts; logs show "listening on 127.0.0.1:9090".
- `cd web/frontend && npm install && npm run dev` starts Vite on its default port.
- Open `http://localhost:8080` in a browser → page renders the JSON output of `get_system_info`, proving the full pipeline (browser → Vite → axum → yerpc → deltachat-jsonrpc → core → response).
- Disconnect the browser tab; daemon logs an emitter `unref` and continues running.
- Stop daemon with Ctrl+C; no orphan tasks reported.

### Depends on

Nothing.

---

## Phase 1 — Three-pane shell with collapsible panes ✅ DONE (2026-05-10)

**Outcome:** Three-pane shell renders against deterministic mock data. `web/frontend/src/shell/App.svelte` is the new root (was `src/App.svelte`, deleted) — composes `NavTabs.svelte` (pane 1, fixed-width profile rail with selection-stripe + add-account tile), `ChatListPane.svelte` (pane 2, drag-resizable 56–520 px with avatar-only mode under 80 px, search input, mock chats), `Splitter.svelte` (pointer-event drag handle), and `MainPane.svelte` (pane 3, top-bar with theme picker + placeholder body). `src/lib/prefs.svelte.ts` exposes `$state`-backed `prefs` (`theme`, `pane2Width`, `pane1Collapsed`) with `savePrefs()` persisting under `qxp.web.prefs` in localStorage. `src/lib/mock.ts` ships 3 mock accounts + 5 mock chats and an `avatarInitial` helper. `src/styles/{reset.css,tokens.css,theme.css}` define a CSS-custom-property design system with light/dark/system modes (system follows `prefers-color-scheme`); `app.ts` imports them globally and mounts the shell. Theme switching is instant via `[data-theme]` on `<html>`. Pane 1 collapses to zero (chevron in pane 1 footer; expand chevron appears in pane 2 header when collapsed); pane 2 splitter persists width across reloads.

**Gotchas:**
- Module-level `$state` in `.svelte.ts` is a Svelte 5 feature — works because `@sveltejs/vite-plugin-svelte` v5 compiles `.svelte.ts` files through the rune compiler.
- The selection effect for accounts in pane 1 is just a 3px accent stripe; mock chats are shared across accounts so switching accounts produces no other change. Real per-account chatlists arrive in Phase 12.
- `$derived.by(() => …)` used in `ChatListPane` for the search filter; works in Svelte 5.



**Goal:** The full app shell renders with the three panes, each collapsible per the user's spec; placeholders fill the panes' content. No real data yet.

### Scope

- Svelte components for the shell: `NavTabs.svelte` (pane 1, profile rail), `ChatListPane.svelte` (pane 2), `MainPane.svelte` (pane 3).
- A horizontal flex layout with two draggable splitters; widths persisted in `localStorage`.
- Pane 1 collapse: chevron toggle, animates to `width: 0`. Pane 2 collapse: width clamps to ≈ 56 px showing only avatars (rows truncate to avatar-only mode via a width-class, like Signal's `WidthBreakpoint`).
- Empty/placeholder content in all three panes: pane 1 shows a fake list of three avatar tiles, pane 2 shows a stubbed chatlist with mock rows, pane 3 shows "select a chat".
- Theme tokens (light/dark/system via `prefers-color-scheme` + a manual override) wired up in CSS custom properties; switch via a debug button in pane 3 for now (the real Settings UI lands later).

### Files / dirs created

- `web/frontend/src/shell/{App.svelte,NavTabs.svelte,ChatListPane.svelte,MainPane.svelte,Splitter.svelte}`.
- `web/frontend/src/styles/{tokens.css,reset.css,theme.css}`.

### Steps

1. Build the static layout with three panes; hard-code widths first.
2. Add `Splitter.svelte` between panes; persist preferred widths to `localStorage` keys (`qxp.web.pane1Width`, `qxp.web.pane2Width`).
3. Add collapse toggles; clamp ChatListPane width below the breakpoint into avatar-only row rendering.
4. Wire up theme tokens; verify dark mode flips entirely from one CSS variable change.
5. Commit a `MockData` Svelte module with deterministic placeholder rows so the shell has something to show.

### Verification

- Open `http://localhost:8080` → three panes render, drag splitters to resize, refresh page → widths persist.
- Click pane 1 collapse → pane 1 disappears entirely; click again → returns to previous width.
- Drag pane 2 splitter to its minimum → rows compress to avatar-only strip (≈ 56 px); tooltip-on-hover shows the chat name.
- Toggle dark/light → all three panes switch coherently; system-mode follows `prefers-color-scheme`.
- Resize the browser window down to ≈ 800 px wide → layout still functions; cosmetic glitches are acceptable in this phase (mobile breakpoints are out of scope).

### Depends on

Phase 0.

---

## Phase 2 — Account onboarding (all flows) ✅ DONE (2026-05-10)

**Outcome:** All four flows wired to live `deltachat-jsonrpc`. `web/frontend/src/onboarding/Onboarding.svelte` is a tiny FSM (`welcome | instant | manual | backupImport | backupReceive`) gated in `App.svelte` on `accounts.configuredIds.length === 0`. Welcome shows the qxp wordmark + logo + Sign Up primary + "I Already Have a Profile" dropdown (Manual / Restore Backup / Add as Second Device). `Instant.svelte` collects display name, hits `add_account` → `select_account` → `set_config(displayname)` → `set_config_from_qr(dcaccount:nine.testrun.org)` → `configure` → `start_io`. `ManualLogin.svelte` exposes addr + password and a collapsible advanced fieldset (mail_server, mail_port, mail_security, send_server, send_port, send_security, imap_certificate_checks). `BackupImport.svelte` accepts a `.tar` via file picker or drag-drop, streams the bytes through `POST /upload?ext=tar` (new `web/server/src/upload.rs`) and feeds the returned daemon-side path into `import_backup`. `BackupReceive.svelte` mounts `qr/Scanner.svelte` (BarcodeDetector → jsQR fallback), filters for `DCBACKUP2:` payloads, confirms, and calls `get_backup`. All four flows share `lib/state/onboarding.svelte.ts` — a single `phase` rune (`idle | configuring | importing | receiving | failed`) driven by `ConfigureProgress` / `ImexProgress` events polled in `lib/events.ts`. `ProgressOverlay.svelte` renders a non-dismissable modal with a `<progress>` bar and a Cancel button that calls `stop_ongoing_process`. `lib/state/accounts.svelte.ts` exposes `accounts.{loaded,ids,configuredIds,selectedId}` and a `purgeUnconfigured()` cleanup that runs once per page load to drop accounts left behind by interrupted flows. The Onboarding screen disappears as soon as `configuredIds.length > 0` and the shell takes over.

**Gotchas:**
- `deltachat-jsonrpc` does **not** push events as JSON-RPC notifications — clients must poll `get_next_event_batch` (which blocks until at least one event arrives). One long-lived `lib/events.ts` poll loop per tab fans events to handlers keyed by `event.kind`. Loop restarts on the `connected` status transition after a reconnect.
- The browser can't pass file paths to `import_backup`. Solved with a tiny axum `POST /upload` endpoint that streams the body to `<accounts_dir>/_uploads/qxp-upload-<nanos>.<ext>` and returns the absolute path; that path is fed straight into the JSON-RPC method. Will be reused in Phase 7 for image/video/file attachments.
- `MediaDevices.getUserMedia` requires a **secure context** — plain HTTP on a LAN host (e.g. `http://nixos.local:8080`) leaves `navigator.mediaDevices` `undefined`. Scanner.svelte detects this and shows "Use Paste Code below, or open this app from localhost." instead of throwing. Add-as-Second-Device works fine on `http://localhost:8080` and over `https://`.
- Native `BarcodeDetector` is gated behind a try/catch — Firefox returns truthy for `window.BarcodeDetector` in some configurations but throws on construction; the jsQR fallback (≈45 KB minified) catches that path.
- One reconnect quirk: a half-configured account (e.g. tab closed mid-`configure`) leaves a row in `get_all_account_ids` whose `is_configured` is false. `purgeUnconfigured()` removes those exactly once per fresh page load (not on every reconnect, which would also blow away in-flight onboarding state).
- `set_config_from_qr` is the canonical chatmail-provider hook; we hard-code `dcaccount:nine.testrun.org` for v1 — Phase 12 / settings will expose a custom-provider QR scan that re-uses `Scanner.svelte`.

**Goal:** From a fresh daemon (empty accounts dir) the user reaches a populated chat list via any of: (a) chatmail instant signup, (b) manual IMAP/SMTP login, (c) restore from `.tar` backup file, (d) add-as-second-device QR pair. Mirrors `plans/onboarding.md`.

### Scope

- Welcome splash with two primary actions: **Sign Up** (instant) and **I Already Have a Profile** (menu: Manual Setup / Restore Backup / Add as Second Device).
- Instant onboarding screen: avatar picker, display-name field, privacy link with provider host substitution, Create button, "Use Other Server" submenu (Other Servers link / Scan Invitation Code / Manual Setup).
- Manual login screen: addr + mail_pw fields, "advanced" toggle exposing the 7 additional IMAP/SMTP fields (`mail_server`, `mail_port`, `mail_security`, `send_server`, `send_port`, `send_security`, `imap_certificate_checks`).
- Backup import: file picker (browser file input filtered to `.tar`); progress bar streamed from `dc_event_imex_progress`.
- Add-as-Second-Device: prompts the *other* device to show its `DCBACKUP2:…` QR; we **scan via webcam** (browser MediaDevices + a QR decode lib — call out the lib choice in the Phase steps; minimal options: hand-rolled `jsQR` ≈ 50 KB minified, or `barcode-detector` web platform API where available).
- Single onboarding-progress modal shared across all four flows (mirrors `OnboardingProgressOverlay` in iOS): non-dismissable, percentage, cancel button calling `stop_ongoing_process`.
- Error paths: each flow surfaces the core's `last_error_string` in the modal on failure; cancel + recover.

### Files / dirs created

- `web/frontend/src/onboarding/{Welcome.svelte,Instant.svelte,ManualLogin.svelte,BackupImport.svelte,BackupReceive.svelte,ProgressOverlay.svelte}`.
- `web/frontend/src/lib/state/onboarding.svelte.ts` (Svelte store: phase, progress, error).
- `web/frontend/src/qr/Scanner.svelte` (camera + decoder; reused later by Phase 11).

### Steps

1. Frontend: build the Welcome screen and route into each flow; instant + manual + backup-import work without camera access.
2. Wire `set_config_from_qr` + `configure` + `imex` JSON-RPC calls; subscribe to `ConfigureProgress` and `ImexProgress` notifications and pipe into the shared progress store.
3. Pick a QR decode strategy (proposal: prefer native `BarcodeDetector` where present, fall back to `jsQR`); document choice in `Scanner.svelte` header comment.
4. Build `Scanner.svelte` against `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })`; on a successful frame decode, emit a typed event with the decoded string.
5. Implement add-as-second-device: scan → confirm dialog → call `receive_backup` → progress in shared modal.
6. Error / cancel paths per `plans/onboarding.md` Milestone 8 (background tab equivalent: visibilitychange → cancel; navigate-away → cancel).

### Verification

- Empty accounts dir → first page load shows Welcome.
- **Sign Up** with display name "Alice" → progress reaches 1000 → land on chat list with one Device Messages chat.
- **Manual Setup** with a real IMAP/SMTP account → progress reaches 1000 → land on chat list populated from that account.
- Export a `.tar` backup from another DC client → drag into BackupImport file input → progress reaches 1000 → chat list populated with prior history.
- On a phone running the official DC client, generate a "Backup to other device" QR; in the web client choose "Add as Second Device" → grant camera → scan → confirm → progress streams → chat list populated.
- Force a failure (wrong password on Manual Setup) → modal surfaces `last_error_string`, OK returns to the form with the email/password preserved.
- Refresh page mid-configure → daemon-side configure continues (server holds state); reconnect re-subscribes to progress events and the modal resumes.

### Depends on

Phase 0, Phase 1.

---

## Phase 3 — Chat list (real data) ✅ DONE (2026-05-10)

**Outcome:** Pane 2 renders the live chatlist for the selected account, dropping the Phase-1 mock data path. New module `web/frontend/src/lib/state/chatlist.svelte.ts` exposes a `$state`-backed `chatlist.{accountId, ids, items, query, loading}` rune. `setActiveAccount(id)` (called from `App.svelte` via `$effect` on `accounts.selectedId`) calls `get_chatlist_entries(account_id, null, query?, null)` followed by `get_chatlist_items_by_entries(account_id, ids)` and stores the items keyed by id in a `Map`. A generation counter (`loadGen`) guards against out-of-order reloads when the user switches accounts mid-fetch. `setSearchQuery(q)` debounces 150 ms before re-issuing the chatlist call (deltachat does the matching server-side via the `query_string` arg, which mirrors the chatlist filter that the original UI uses). Live updates: the module subscribes via `lib/events.ts` to `ChatlistChanged` (full reload), `ChatlistItemChanged{chatId}` (single-row patch via `patchItem`), `ChatlistItemChanged{chatId:null}` (visible items reload), and as defensive fallbacks `IncomingMsg | MsgsChanged | ChatModified | ChatDeleted | ContactsChanged`. New presentational component `web/frontend/src/shell/ChatListRow.svelte` renders a single item — colored-circle avatar + initial, name with mute icon, accent-coloured timestamp when unread, single-line preview composed from `summary_text1: summary_text2`, unread pill (capped at "99+") or pin icon. New `web/frontend/src/lib/format/timestamp.ts` mirrors iOS's `RelativeChatTimestampFormatter` using `Intl.DateTimeFormat` (today→short time, last-7-days→short weekday, older→short date). `ChatListPane.svelte` was rewritten to consume the chatlist store and iterate over `chatlist.ids` rendering `ChatListRow` per row, with empty states for "no conversations yet" / "no conversations match". `MainPane.svelte` reads selected-chat info from `chatlist.items.get(selectedChatId)` and shows a topbar with avatar + name + subtitle (`Saved messages | Device | Group chat | Direct chat · encrypted | …`); the body is still the Phase-4 placeholder. `App.svelte` was rewired to bind `selectedAccountId` to `accounts.selectedId`, push it into `setActiveAccount`, clear `selectedChatId` on account switch, and call `select_account` on the daemon when the user clicks a profile tile. New shared `web/frontend/src/lib/Logo.svelte` factored out the qxp logomark; the boot screen and `Welcome.svelte` both render it (boot screen no longer shows logo-less plain "qxp" text).

**Gotchas:**
- TypeScript narrows `$state.kind` aggressively across `await` boundaries — comparisons like `if (onboarding.phase.kind !== 'failed')` inside catch blocks were flagged as "no overlap" because TS can't see the parallel mutation by the event poll loop. Worked around with a tiny `currentPhaseKind()` helper that re-reads through the widened union; same trick will be reusable in any rune that's mutated by side-channel event handlers.
- `get_chatlist_entries` always includes a synthetic "archived link" row when archived chats exist; we filter those out for now (the visible-id list only includes `kind: 'chatListItem'`). The archive section ships in Phase 13 / settings.
- `last_updated` from the daemon is **already in milliseconds** (the chat-list item code multiplies the message's unix-seconds timestamp by 1000 before serialising); pass directly to `new Date(ms)`, not `* 1000`.
- Avatar **images** (`avatar_path`) are server-side filesystem paths, so the browser can't `<img src>` them yet. Phase 3 only renders the colored-initial fallback — the iOS app's two-mode `AvatarView` (image OR fallback) becomes a one-mode "fallback always" until a `GET /file?path=…` (or similar) endpoint lands. Tracked as a follow-up; impact is purely cosmetic (most chats don't have explicit avatars on a fresh account anyway).
- Pane 1's `NavTabs` still iterates the Phase-1 `mockAccounts` array; only the *selection state* and `select_account` call are real. Phase 12 (multi-account, profile rail wired to real accounts) replaces the mock data path.

**Goal:** Pane 2 renders the live chatlist for the selected account, sorted by activity, with avatar / name / preview / timestamp / unread badge per row. Search filters in real time.

### Scope

- Replace the placeholder chatlist from Phase 1 with `get_chatlist` + per-row `get_chatlist_item_summary`.
- Subscribe to `MsgsChanged`, `IncomingMsg`, `ChatModified`, `ChatDeleted`, `ContactsChanged` notifications; recompute the affected rows incrementally where possible, full reload on `ChatlistChanged`.
- Avatar rendering: deltachat color tinted circle with white initial, or self-avatar image when set; matches iOS `AvatarView`.
- Search input at top of pane 2 (rune-bound state); filters chatlist by name + last-message text; debounced 150 ms.
- Empty state: "No conversations yet."
- Selected-chat highlight bound to the route in pane 3.
- Timestamp formatter: `today HH:mm` / weekday / `MMM d` / `yyyy-MM-dd` per locale; mirrors iOS `RelativeChatTimestampFormatter`.
- Avatar-only collapsed mode shows unread dot overlays on tiles.

### Files / dirs created

- `web/frontend/src/shell/ChatListPane.svelte` (replaces Phase 1 stub).
- `web/frontend/src/shell/ChatListRow.svelte`.
- `web/frontend/src/lib/state/chatlist.svelte.ts`.
- `web/frontend/src/lib/format/timestamp.ts`.

### Steps

1. Wire `get_chatlist` for the selected account; fetch all summaries up front (typical chatlists are small enough — revisit virtualization if a real account chokes).
2. Subscribe to events and update state.
3. Render rows; clip preview to one line; show unread pill on the right.
4. Search input + filtering; preserve scroll position on filter clear.
5. Click row → set `selectedChatId` → pane 3 routes to `ChatView` (initially still a placeholder; Phase 4 fills it).

### Verification

- With the account from Phase 2, pane 2 lists every existing chat ordered by last activity.
- Send a message from another DC client → row jumps to the top, unread badge increments, preview updates within 1 s.
- Type into search → list filters, clear search → restores order and selection.
- Resize pane 2 to avatar-only → rows collapse to tiles with unread dots.
- Delete a chat from another client → row disappears from the list within 1 s.

### Depends on

Phase 2.

---

## Phase 4 — 1:1 chat view (text only, send + receive) ✅ DONE (2026-05-10)

**Outcome:** `lib/state/chat.svelte.ts` exposes `chat.{active, ids, messages, loading, replyToId, editingId, highlightId}` driven by `get_message_ids` + `get_messages`, with live patches via `IncomingMsg | MsgsChanged | MsgDelivered | MsgRead | MsgFailed`. `chat/ChatView.svelte` renders the scroller + day-markers, uses an "is-the-user-near-the-bottom?" gate to either auto-scroll or bump a `newSinceScroll` counter exposed via `chat/ScrollToLatest.svelte`. `chat/MessageBubble.svelte` dispatches on `viewType` to render text or one of the cell components (Image/Gif/Video/File/Audio/Voice/Vcard/Location), with sender-stripe in groups, edited tag, "(state glyph)" for outgoing, and a quoted-message preview when `message.quote` is set. `chat/Composer.svelte` is a textarea + send button (Enter to send, Shift+Enter newline) with autosize. `chat/InfoMessage.svelte` renders system messages as a centered chip. `mark_noticed_chat` fires on chat open and on `visibilitychange` returning to visible.

**Goal:** Selecting a chat in pane 2 renders the message scroll in pane 3; the user can read history, send text, and see incoming messages live.

### Scope

- `MainPane.svelte` routes `selectedChatId` to a `ChatView.svelte` (other routes — settings, QR, etc. — land later).
- Message list: virtualized scroller (or a simple unvirtualized list if profile shows it's fine for typical chat sizes; pick during phase). Renders `MessageBubble.svelte` per item.
- Bubble shapes mirror iOS: outgoing right + accent, incoming left + neutral; sender name + color stripe in groups (groups exist in DB even if compose isn't built yet — open from pane 2 still works).
- Title bar: chat avatar + name; back-arrow on narrow viewports (parking lot — later phase if needed).
- Composer: textarea + send button; Enter sends, Shift+Enter newline. Disabled when text empty.
- Auto-scroll-to-bottom on initial load and on incoming-message-while-near-bottom; "scroll to latest" button when scrolled away.
- `marknoticed_chat` on chat open and on visibility return.
- Message timestamps + delivery state glyphs (pending / delivered / read / failed) on outgoing.
- Info messages rendered as centered system text.

### Files / dirs created

- `web/frontend/src/chat/{ChatView.svelte,MessageBubble.svelte,Composer.svelte,InfoMessage.svelte,ScrollToLatest.svelte}`.
- `web/frontend/src/lib/state/chat.svelte.ts` (per-chat: messages, draft, scroll position).

### Steps

1. Load messages via `get_message_ids` + per-id `get_message` (or whichever batch-fetch the JSON-RPC API exposes; likely `get_messages` plural).
2. Render bubbles; left/right alignment by `from_id == DC_CONTACT_ID_SELF`.
3. Composer: bind to chat draft store; send via `misc_send_text_message` → optimistic insert pending bubble → reconcile on `MsgsChanged`.
4. Subscribe to `IncomingMsg` and `MsgsChanged` for this chat id; insert / update locally.
5. Mark-noticed wiring; back the deltachat read-receipts setting.
6. Empty state: "No messages yet — say hi!"

### Verification

- Click a chat with history → scroll lands at the bottom showing the latest messages.
- Type and send → message bubble appears immediately (pending state) → state glyph transitions to delivered when receipt arrives.
- Send from another DC client → bubble appears in this chat within 1 s, list row updates, badge clears on visibility (return-to-tab marks noticed).
- Send messages while scrolled up → "scroll to latest" pill appears; clicking it returns to the bottom.
- Refresh page mid-conversation → state reloads, scroll position restores to "near-bottom".

### Depends on

Phase 3.

---

## Phase 5 — Compose flow + contacts (1:1 chat creation) ✅ DONE (2026-05-10)

**Outcome:** Pane 2 gained an FSM (`lib/state/paneMode.svelte.ts`) with modes `inbox | compose | chooseMembers | setGroupMetadata | archive | search`. The compose icon in the chatlist header pushes `compose` mode → `compose/ComposePane.svelte` shows the contact list with three action rows ("New Contact" / "New Group" / "New Channel"). Contact list state lives in `lib/state/contacts.svelte.ts` (debounced server-side search via `get_contacts(account, flags, query)`), refreshed on `ContactsChanged`. Tapping a contact calls `create_chat_by_contact_id` and selects the new chat. "New Contact" pushes the pane-3 route to `qrScan` → `qr/QrDispatcher.svelte` (also covers Phase 11 dispatch).

**Goal:** The "compose" entry point (icon in pane 2 header) opens a sub-state of pane 2 where users search contacts, hit "New Contact" / "New Group" / "New Channel" entry points, and on tap of an existing contact create or open a 1:1 chat.

### Scope

- Pane 2 mode FSM: add `compose` mode (Signal `LeftPaneComposeHelper` analogue). Header swaps to "New conversation" with a back arrow; body lists action rows + searchable contact list.
- Contact list: `get_contacts(flags = DC_GCL_ADD_SELF)`; rows show avatar + name + email.
- "New Contact" → opens QR scanner in pane 3 (full QR scan dispatch lands in Phase 11; for this phase, scan + `check_qr` + dispatch to chat-create / verify alert is enough).
- "New Group" / "New Channel" stubs route to FSM modes added in Phase 6.
- Tap contact → `create_chat_by_contact_id` → select chat → close compose mode.

### Files / dirs created

- `web/frontend/src/compose/{ComposePane.svelte,ContactRow.svelte}`.
- `web/frontend/src/lib/state/compose.svelte.ts`.

### Steps

1. Wire pane-2 mode store (FSM with `inbox | compose | …` states).
2. Build ComposePane: search-bound contact list + three action rows.
3. Implement `create_chat_by_contact_id` and `select chat` flow.

### Verification

- Click compose icon → pane 2 swaps to compose mode with back-arrow.
- Search "ali" → contact list filters live.
- Tap a contact → pane 2 returns to inbox with the new (or existing) chat selected and pane 3 showing it.
- Click back → pane 2 returns to inbox without creating a chat.

### Depends on

Phase 4.

---

## Phase 6 — Group chats + channels (creation + send) ✅ DONE (2026-05-10)

**Outcome:** Two pane-2 modes: `compose/ChooseMembers.svelte` (multi-select with selection-pills above the contact list) and `compose/GroupMetadata.svelte` (name, optional avatar via `POST /upload` → `set_chat_profile_image`, optional verified-group toggle gated on every selected contact's `isVerified`). Group flow calls `create_group_chat(name, protected)`; channel flow uses `create_broadcast(name)`. After create, `add_contact_to_chat` is looped per member; the new chat is then selected. Sender-name + color stripe in `MessageBubble` is gated on `chatType !== 100` (Single).

**Goal:** From compose mode, create a verified or unverified group with name + members + optional avatar/description, or a broadcast channel with name + recipients. Send/receive in the resulting chat works (text-only at this phase).

### Scope

- Two extra pane-2 modes: `chooseGroupMembers` and `setGroupMetadata` (Signal helper analogues).
- Member multi-select: contact list with checkboxes, search, "selected" pill row above.
- Metadata step: name (required), avatar (file picker), description, verified toggle (only enabled if all selected members are verified).
- Group create: `create_group_chat` → loop `add_contact_to_chat` → `set_chat_profile_image` (when avatar) → `set_chat_description` → select chat.
- Channel: `create_broadcast` (recipients only, self excluded), then add contacts + name; select chat.
- Group sender names + colors in `MessageBubble`.

### Files / dirs created

- `web/frontend/src/compose/{ChooseMembers.svelte,GroupMetadata.svelte}`.
- `web/frontend/src/lib/format/avatar.ts` (image resize → blob → blobdir upload).

### Steps

1. Add the two FSM modes; wire forward/back navigation.
2. Member multi-select: standard checkbox list + selection pill row.
3. Metadata form; validate name non-empty; verified toggle gated on contact verification state.
4. Create call sequence; surface errors from any failed step.
5. Update `MessageBubble` to render sender name + color stripe in multi-user chats.

### Verification

- Compose → New Group → select 2 contacts → Next → name "Project chat" → Create → land on the new group chat in pane 3, list row visible in pane 2.
- Send a message in the group → other clients receive it.
- Receive a group message from another client → bubble shows the sender's name and color.
- Compose → New Channel → select recipients → name "Updates" → Create → broadcast list appears; sending broadcasts to recipients works.
- Verified toggle disabled until all selected contacts are `is_verified`; verify a contact (Phase 11), retry — toggle enables.

### Depends on

Phase 5.

---

## Phase 7 — Attachments: images / videos / files / contact / location (one-shot) ✅ DONE (2026-05-10)

**Outcome:** New server endpoint `web/server/src/file.rs` (`GET /file?path=…`) streams files with mime-type guessing + immutable cache headers, validating the path resolves under `accounts_dir` (canonicalize-then-`starts_with` check; rejects with 403 otherwise). `AppState` now carries `accounts_dir: Arc<PathBuf>`. Frontend `lib/files.ts` exposes `fileUrl(path)`, `formatBytes(n)`, `uploadBlob(blob, ext)` helpers. `chat/AttachMenu.svelte` is the popup off the composer paperclip; `chat/Composer.svelte` was extended with image/video file picker, generic file picker, one-shot location share via `navigator.geolocation.getCurrentPosition` (sent as `MessageData{ location: [lat, lon] }`), and contact-via-vcard share (`make_vcard` → `/upload` → `sendMsg{ viewtype: Vcard, file }`). Inline cells live in `chat/cells/`: `ImageCell` (click → `chat/ImageLightbox.svelte`), `VideoCell` (`<video controls>`), `FileCell` (icon + name + size + download link), `VcardCell` (preview + Open chat → `create_contact` → `create_chat_by_contact_id`), `AudioCell` (`<audio controls>`), `LocationCell` (placeholder badge — full map preview deferred until Phase 19's `get_locations` wiring). `MessageBubble` dispatches on `viewType` into the right cell.

**Goal:** Send and receive images, videos, generic files, contact (vcard), and one-shot location messages. Each renders inline in the chat with appropriate preview affordances.

### Scope

- Composer attach button → menu: Photo/Video, File, Location, Contact.
- Photo/Video: browser `<input type="file" accept="image/*,video/*">` (or drag-drop into the composer area). Image: send via `misc_send_msg` with viewtype `image`; video viewtype `video`.
- File: any other type → viewtype `file`.
- Contact: open contact picker (sub-FSM in pane 2 or modal) → `misc_send_msg` with viewtype `vcard`.
- Location: button opens a one-shot map UI to pick a point, or sends current `navigator.geolocation` as `viewtype: location` (decide during phase — proposal: send current location for v1, picker is a follow-up).
- Inline rendering:
  - Images / GIFs: thumbnail with click-to-zoom modal (carousel through chat's images).
  - Videos: thumbnail (poster from first frame) + play overlay; click opens HTML5 player modal.
  - Files: file icon + name + size + download button.
  - vcard: name + email + "Open chat" button (creates 1:1 with that contact).
  - Location: small static map preview (a tile from openstreetmap.org tile server — call out the tile-server choice + caching policy in steps).
- Drag-drop into the chat scroll area also stages an attachment.
- Auto-download: respect `download_limit` config (Phase 13 exposes UI; for this phase, just respect what's set).
- Attachment quality picker (`media_quality`) respected on send; UI to change it lands in Phase 13.

### Files / dirs created

- `web/frontend/src/chat/cells/{ImageCell.svelte,VideoCell.svelte,FileCell.svelte,VcardCell.svelte,LocationCell.svelte}`.
- `web/frontend/src/chat/Composer.svelte` (extended with attach menu).
- `web/frontend/src/chat/AttachMenu.svelte`.
- `web/frontend/src/chat/{ImageLightbox.svelte,VideoPlayer.svelte}`.

### Steps

1. Composer attach menu + drag-drop region.
2. File-upload pipeline: read file → save to blobdir via `misc_send_msg` (the JSON-RPC method takes a path; we need to upload the bytes — investigate `copy_to_blobdir` or equivalent; if not available, surface as an open question).
3. Cell renderers per viewtype.
4. Lightbox component reused for images and videos.
5. Location: navigator.geolocation; map preview from OSM tiles.

### Verification

- Send a JPEG → bubble shows the image inline → other clients receive it intact → click on local bubble opens lightbox; arrow keys cycle through chat images.
- Send a 20 MB MP4 → progress indicator while uploading → bubble shows poster + play overlay → click opens HTML5 player.
- Send a PDF → bubble shows file icon + name + size; click downloads.
- Send a vcard → bubble shows the contact preview; "Open chat" creates a 1:1 with that contact.
- Send current location → bubble shows the map tile preview + lat/lon.
- Drop a file onto the chat scroll area → composer stages it → press send → arrives correctly.
- Receive each viewtype from another client → bubbles render correctly.

### Depends on

Phase 4. (Independent of groups, but multi-user attachments are part of the verification.)

### Open question for this phase

How do we get binary attachment bytes into the daemon's blobdir? `deltachat-jsonrpc` exposes string-path-based send methods; a browser can't pass a path. Either (a) the daemon accepts a separate HTTP `POST /upload` for the bytes and returns a path, or (b) the JSON-RPC method takes base64 / chunked bytes. Resolve in the steps once we read the JSON-RPC schema.

---

## Phase 8 — Voice messages (record + waveform playback) ✅ DONE (2026-05-10)

**Outcome:** `lib/audio/recorder.ts` exposes `VoiceRecorder` wrapping `MediaRecorder` — picks the most deltachat-compatible Opus container available (`audio/ogg;codecs=opus` → `audio/webm;codecs=opus` → `audio/webm`). Composer adds a mic button that's swapped in for the send button when `text.trim() === ''` and `pickMimeType()` returned non-null. Recording UX: tap mic → grant permission → status pill shows `Recording… 0:12` with a pulsing red dot + cancel ✕ + send ➤. On send, the blob streams through `/upload` and `sendMessage({ viewtype: 'Voice', file: path })`. `chat/cells/VoiceCell.svelte` renders an inline player with a play/pause button, click-to-seek progress bar, elapsed/total time, and a 1× / 1.5× / 2× speed toggle. (Full PCM-derived waveform is deferred to Phase 23 polish.)

**Goal:** Hold-to-record voice button in composer; arriving voice messages render with playback controls and a waveform.

### Scope

- Composer mic button: hold to record, release to send (or tap-to-toggle on desktop). Records via `MediaRecorder` API as `audio/webm;codecs=opus` or `audio/ogg`; converts/encodes if core requires a specific format (decide during phase; deltachat ingests opus directly).
- Waveform during recording: live PCM amplitude rendering on a canvas.
- Voice cell in chat: play/pause button + waveform + duration + speed-toggle (1× / 1.5× / 2×).
- Generated thumbnail / preview for the message list ("Voice message · 0:14").

### Files / dirs created

- `web/frontend/src/chat/Composer.svelte` (extended).
- `web/frontend/src/chat/cells/VoiceCell.svelte`.
- `web/frontend/src/lib/audio/{recorder.ts,waveform.ts}`.

### Steps

1. Permission flow + `MediaRecorder` setup.
2. Live waveform rendering during record.
3. Encode + send as `viewtype: voice`.
4. Voice cell with playback + waveform.

### Verification

- Mic button → grant permission → hold → speak → release → bubble appears with waveform + duration.
- Playback works at 1× and at 1.5×.
- Receive a voice message from another DC client → renders the same way.
- Deny permission → composer shows a one-line hint and the mic button is disabled.

### Depends on

Phase 7 (shares the composer attach pipeline).

---

## Phase 9 — Reactions + emoji picker ✅ DONE (2026-05-10)

**Outcome:** Right-click on a `MessageBubble` opens `chat/ContextMenu.svelte` — a portal-positioned popover with the 7 quick reactions (`lib/emoji/data.ts::QUICK_REACTIONS`: 👍 👎 ❤️ 😂 😮 😢 🙏) + a "+" button that opens `chat/EmojiPicker.svelte` (search across ~230 curated emojis grouped into 8 categories, with persistent recents in `localStorage`). Reactions are sent via `sendReaction(account, msgId, [emoji])` with replace-not-multi semantics: tapping the same emoji again sends `[]` (clearing your reaction); a different emoji replaces. `chat/ReactionsRow.svelte` renders the chip row under each bubble using `message.reactions.reactions` (sorted desc by count); your own reactions get an accent-tinted chip. `lib/state/chat.svelte.ts::toggleReaction` is the single helper.

**Goal:** Right-click / long-press a message → reaction row of common emoji + "more" → full picker. Reactions render under bubbles; tapping own reaction toggles it off.

### Scope

- Context menu trigger: right-click on desktop, long-press on touch.
- Quick reactions row (👍 👎 ❤️ 😂 😮 😢 🙏 — 6–7 common; configurable later).
- "More" → custom emoji picker sheet: search by Unicode name, recents, categorised grid (mirrors `plans/msg-funcs.md` Phase 3).
- Reactions data: `send_reaction` / `MsgChanged` with reaction info; render under the bubble with sender count tooltip.
- Recents persisted to `localStorage`.

### Files / dirs created

- `web/frontend/src/chat/{ContextMenu.svelte,ReactionsRow.svelte,EmojiPicker.svelte}`.
- `web/frontend/src/lib/emoji/data.ts` (Unicode CLDR-derived emoji list).

### Steps

1. Right-click handler on `MessageBubble` → portal-positioned menu.
2. Quick row + "more" trigger.
3. Emoji picker sheet with search / recents / categories.
4. `send_reaction` wiring; render reactions under bubbles.

### Verification

- Right-click a message → reaction row appears anchored above; click 👍 → reaction shows under the bubble; click again → toggles off.
- More → picker opens; search "heart" → matching emoji; click → reaction sent.
- Receive a reaction from another client → reaction count updates live.

### Depends on

Phase 4.

---

## Phase 10 — Message actions: reply / forward / edit / delete / copy + swipe-to-reply ✅ DONE (2026-05-10)

**Outcome:** `ContextMenu` was extended with an actions list (Reply / Copy / Forward / Edit / Delete) the parent (`ChatView`) computes per-message — Edit only shows on own outgoing text, Copy on messages with `.text`. Reply sets `chat.replyToId` → `Composer` shows `chat/QuoteBar.svelte` above the textarea with sender + snippet + ✕; sending fires `sendMessage{ quotedMessageId }`. Edit sets `chat.editingId`, hydrates the textarea with the message text, and routes the next send through `send_edit_request`. Forward opens `chat/ChatPicker.svelte` (a modal listing the chatlist with a search input) → `forward_messages`. Delete confirms then calls `delete_messages` and patches state. Copy uses `navigator.clipboard.writeText`. Quoted replies render inline in `MessageBubble` from `message.quote`, with author color stripe + click-to-jump (calls `flashMessage` on the target id; `ChatView` scrolls to the matching `#msg-<id>` element). Swipe-to-reply: pointer-down/move/up on the bubble — drag right past 60 px triggers the reply action.

**Goal:** Full message context menu beyond reactions. Quote-replies render in bubbles; edits show "(edited)"; forward opens a chat picker; delete confirms; swipe right on a bubble triggers reply.

### Scope

- Extend the Phase 9 context menu with Reply / Copy / Forward / Edit (own outgoing text only) / Delete (destructive, confirmed).
- Reply: sets a `draftReplyTo` on the chat store; composer renders a quote bar above the textarea showing sender + snippet + close.
- Edit: sets `editingMessageId`; composer pre-fills with the message text; send button dispatches `send_edit_request`.
- Forward: opens chat picker modal; selection calls `forward_messages`.
- Delete: confirmation alert → `delete_messages`.
- Copy: writes message text to clipboard via `navigator.clipboard.writeText`.
- Swipe-to-reply: pointer events on the bubble; threshold reached → trigger reply (matching iOS swipe gesture).
- Quoted-reply rendering inside bubbles (sender name + snippet, click jumps to the original).
- "(edited)" suffix in bubble footer when `is_edited`.

### Files / dirs created

- `web/frontend/src/chat/QuoteBar.svelte`, `web/frontend/src/chat/EditBar.svelte`, `web/frontend/src/chat/ChatPicker.svelte`.
- `web/frontend/src/chat/MessageBubble.svelte` extended.

### Steps

1. Extend ContextMenu with the new actions.
2. Reply / edit composer states.
3. Forward picker + `forward_messages`.
4. Delete + confirm.
5. Quoted-reply rendering (recursive — the quoted `MessageItem` may itself have a quote, render only one level deep).
6. Swipe-to-reply on touch + pointer events.

### Verification

- Right-click message → menu shows all six actions; greyed correctly (Edit only on own outgoing text; Copy hidden when text empty).
- Reply → quote bar appears; send → arrives with quoted-reply rendered; tap quote in target client jumps to the original.
- Forward → chat picker → pick chat → message appears in target chat; toast confirms.
- Edit own message → modify → send → "(edited)" badge appears on the bubble; other clients see the update.
- Delete → confirm → bubble disappears.
- Copy → message text on clipboard (verify by pasting elsewhere).
- Swipe right on a bubble → reply quote bar appears.

### Depends on

Phase 9.

---

## Phase 11 — QR (show + scan, full dispatch) ✅ DONE (2026-05-10)

**Outcome:** `qr/QrShow.svelte` renders the daemon-produced SVG straight from `get_chat_securejoin_qr_code_svg(account, chat?)` — Open Question 3 resolved by skipping a frontend QR-encoder library entirely (the daemon already produces SVG via `deltachat-core-rust::qr_code_generator`). Buttons: Copy link (clipboard `writeText`), Paste code (reads clipboard → `check_qr` → alerts kind), Withdraw (confirmation → `set_config_from_qr` with the same payload, which deltachat-core treats as a withdraw). `qr/QrDispatcher.svelte` (already built in Phase 5) handles the **full** `DC_QR_*` matrix in one switch: AskVerifyContact/Group/Broadcast → `secure_join`; FprOk/Addr → `create_chat_by_contact_id`; Url → `window.open`; Text → clipboard; Proxy/WebrtcInstance/Login → `set_config_from_qr`; Withdraw*/Revive* → `set_config_from_qr` then re-render; Account/Backup2 → "use the onboarding flow" message. NavTabs gained a footer button to open QR Show; ChatInfo gained an "Invite QR" entry that pushes `qrShow` with `chatId`.

**Goal:** A QR section reachable from pane 2 or settings: shows the user's setup-contact / securejoin QR + share / copy / paste / withdraw; scanner handles the full `DC_QR_*` matrix (verify-contact, verify-group, addr, text, url, withdraw/revive, etc.).

### Scope

- "QR" entry in pane 2 (above the chatlist or in a top action row).
- Show side: render securejoin QR, caption, ShareLink (copy `https://i.delta.chat/#…` URL), Copy, Paste, Withdraw (confirmed).
- Scan side: webcam scanner; on each detection call `check_qr`; dispatch by state (mirrors `plans/qr.md` Milestone 3).
- Pane 3 routes accordingly (open chat after verify, info alerts, error alerts).
- Group QR invite (from `GroupInfoView`) lands together (small additional hook).

### Files / dirs created

- `web/frontend/src/qr/{QrTab.svelte,Show.svelte,Scan.svelte,Dispatch.svelte}`.
- `web/frontend/src/qr/QrImage.svelte` (rendered via a small library or hand-rolled — pick during phase; minimal options: `qrcode` npm package or `qr-code-styling`).

### Steps

1. Add JSON-RPC wrappers if missing (`get_securejoin_qr`, `check_qr`, `join_securejoin`, `set_config_from_qr`).
2. Show view; ShareLink → copy URL to clipboard with toast.
3. Scan view (reuses `Scanner.svelte` from Phase 2).
4. Dispatcher per `DC_QR_*` state.
5. Group QR invite hook.

### Verification

- Open QR Show → QR visible, caption shows display name + addr.
- Copy → invite URL on clipboard.
- Scan another user's QR → verified-chat confirm → OK → land in the new chat with verified badge.
- Scan a `DC_QR_ADDR` QR → confirm → 1:1 chat created.
- Scan a `DC_QR_TEXT` QR → alert with text + Copy.
- Scan a `DC_QR_URL` QR → confirm → opens in a new tab.
- Withdraw → confirmation → QR re-renders with new payload.

### Depends on

Phase 6 (group invite hook), Phase 2 (scanner).

---

## Phase 12 — Multi-account: profile rail (pane 1) wired to real accounts ✅ DONE (2026-05-10)

**Outcome:** `lib/state/profiles.svelte.ts` exposes `profiles.list: Profile[]` populated by `get_account_info` per configured id, with `freshCount` from `get_fresh_msgs` patched on `IncomingMsg | MsgsNoticed | MsgsChanged`. `NavTabs.svelte` was rewritten to iterate `profiles.list` (drops the Phase-1 mock data path) — tile renders the daemon-served avatar via `/file?path=…` if `profileImage` is set, else colored-initial fallback; per-tile badge shows the unread count. Right-click on a tile opens a context menu (Edit profile / Switch to / Remove…). NavTabs footer also gained the QR-show + Settings buttons. Add-account tile (`+`) flips an `App.svelte` flag that re-shows the `Onboarding` flow with a "← Back" button; on success (configured count grows) the flag flips back. Remove confirms then calls `remove_account` and re-fetches. Profile editor reachable via the right-click menu; renders `settings/Profile.svelte` standalone.

**Goal:** Pane 1 shows real configured accounts; clicking switches active account; per-avatar unread badge totals fresh msgs across that account's chats; "+ Add Account" tile reuses Phase 2 onboarding.

### Scope

- `accounts.list` + `accounts.get_account_info` (or equivalent JSON-RPC). Selected account persisted server-side (deltachat tracks "selected").
- Account switch: rebuild chat-list / clear pane 3 selection / re-subscribe events for new selected account.
- Per-account unread badge: sum of `get_fresh_msgs` per account-id; bubble overlay on each avatar.
- "+ Add Account" → onboarding flow restricted to instant + manual + restore (no backup-receive — that needs an existing account). Routes back to the new account on success.
- Logout / remove account: option in profile context menu (right-click on avatar) → confirmation → `accounts.remove_account`. Falls back to next account or empty-state Welcome if last.
- Profile editor (display name, avatar, signature/status) reachable via a settings entry in pane 1 or pane 2 (decide during phase — proposal: settings reaches it via "Profile").

### Files / dirs created

- `web/frontend/src/shell/NavTabs.svelte` (extended from Phase 1 placeholder).
- `web/frontend/src/lib/state/accounts.svelte.ts`.
- `web/frontend/src/profile/{ProfileEditor.svelte,AvatarUpload.svelte}`.

### Steps

1. Wire account list + selected.
2. Avatar tiles in pane 1; badge overlay.
3. Account-switch flow: rebuild chatlist store, drop chat selection.
4. Add-account tile → onboarding.
5. Profile editor.
6. Logout / remove account.

### Verification

- After Phase 2 the rail shows one tile + "+". Click "+" → run instant signup again → second tile appears.
- Click between tiles → chat list and selected chat swap correctly; events for the inactive account still fire (unread badge on its tile increments).
- Send to inactive account from another client → its tile badge goes to 1 within 1 s.
- Right-click tile → "Edit profile" → editor opens in pane 3 → change name/avatar → tile updates.
- Right-click tile → Remove → confirm → tile disappears, list compacts.
- Remove the last account → app routes back to Welcome.

### Depends on

Phase 2, Phase 3.

---

## Phase 13 — Settings: chats / appearance / blocked / auto-delete / profile ✅ DONE (2026-05-10)

**Outcome:** `settings/Settings.svelte` is a left-rail + content-pane shell reachable via NavTabs's settings footer button. Sections (`Profile`, `Appearance`, `Chats & Media`, `Blocked`, `Backup`, `Relays`, `About`) are sibling components inside `settings/`. **Profile** writes display name + signature + selfavatar via `set_config` keys (`displayname`, `selfstatus`, `selfavatar`); avatar upload streams through `/upload`. **Appearance** persists theme (`prefs.theme`) + accent (`prefs.accent`, applied via `--color-accent` CSS var) + chat wallpaper (`prefs.wallpaper`). **Chats & Media** binds `mdns_enabled`, `media_quality`, `download_limit`, `delete_device_after`, `delete_server_after`, with a Preview-count button that calls `estimate_auto_deletion_count`. **Blocked** lists `get_blocked_contacts` with an Unblock button (`block_contact(id, false)`). **Backup** triggers `export_backup` to `<accounts_dir>/_uploads/`, listens for `ImexProgress` + `ImexFileWritten`, and serves the produced `.tar` back to the browser via `/file?path=…`. **About** dumps `get_system_info` for diagnostics.

**Goal:** A reachable settings surface (pane 3 route) with the Chats and Media section, Appearance section, and Profile section. Mirrors `plans/chats-settings.md`.

### Scope

- Settings entry in pane 2 footer / NavTabs.
- Sections:
  - **Profile:** display name, avatar, signature (`selfstatus`).
  - **Appearance:** theme (system / light / dark), accent color picker, chat wallpaper (none / preset / custom).
  - **Chats and Media:** Blocked Contacts list (with unblock), Outgoing Media Quality, Auto-Download, Read Receipts toggle, Auto-Delete from Device, Auto-Delete from Server (hidden for chatmail accounts; estimated count alert on enable).
  - **Backup:** Export → save `.tar` to disk; Add Second Device → opens Phase 14's QR show in pane 3.
  - **About + Log view + Version.**

### Files / dirs created

- `web/frontend/src/settings/{Settings.svelte,Profile.svelte,Appearance.svelte,ChatsAndMedia.svelte,BlockedContacts.svelte,Backup.svelte,About.svelte,Log.svelte}`.

### Steps

1. Settings shell with section list (left rail of pane 3) + content panel.
2. Each section bound to its config keys via `get_config` / `set_config_int` / `set_config_bool`.
3. Blocked Contacts: `get_blocked_contacts` + `block_contact(id, 0)` to unblock.
4. Auto-delete confirmation alert with `estimate_deletion_cnt`.
5. Backup export: stream the `.tar` to a browser file download (likely needs an HTTP `GET /backup/<token>` endpoint on the daemon — call out in steps).
6. Wallpaper: store the chosen image as a persisted asset (blobdir or daemon-side state), apply via CSS background on chat scroller.

### Verification

- Open Settings → all sections render.
- Toggle dark mode → entire app flips coherently.
- Change accent → all accent-tinted UI updates.
- Change media quality → next image attachment respects the new setting.
- Enable Auto-Delete from Device (1 week) → confirmation alert shows estimated message count → confirm → setting persists; messages older than 7d are deleted on next core sync.
- Block a contact (from contact context menu, lands in Phase 15) → contact appears in BlockedContacts; unblock → returns.
- Export backup → file downloads as `qxp-backup-<date>.tar`; restore on another instance succeeds.

### Depends on

Phase 12 (uses selected account).

---

## Phase 14 — Connectivity + relay management ✅ DONE (2026-05-10)

**Outcome:** `settings/Relays.svelte` renders a connectivity badge driven by `get_connectivity` (mapped to "Not connected / Connecting / Updating / Connected" thresholds 1000/2000/3000) and refreshed live on `ConnectivityChanged`. A **Details…** button fetches `get_connectivity_html` and renders the daemon HTML inline. Proxy list reads `get_config('proxy_url')` (newline-separated), with Add (prompt → `set_config_from_qr` + restart-IO) and Remove (rewrite list → restart-IO) buttons; the master toggle binds `proxy_enabled` and is disabled when the list is empty. Restart-IO is composed as `stop_io → start_io` since the daemon doesn't expose a `restart_io` JSON-RPC.

**Goal:** A "Relays" screen (settings entry) showing connectivity badge, quota, last-sent message status; manage proxies (enable, list, add, select, delete). Mirrors `plans/connectivity.md`.

### Scope

- Connectivity badge in pane 1 footer or pane 2 header (compact, toast on tap).
- Settings → Relays:
  - Toggle: Use Relay (disabled when list empty).
  - Relay list: host (from `check_qr().text1`), checkmark on selected, connectivity state on selected row.
  - Add Relay: alert with text input → `check_qr` validates → `set_config_from_qr` → restart IO.
  - Swipe-to-delete (or trash icon).
- `dc_event_connectivity_changed` subscription drives live state.
- Quota parsed from `get_connectivity_html` (extract quota percentage natively; ignore the rest of the HTML).

### Files / dirs created

- `web/frontend/src/settings/{Relays.svelte,ConnectivityBadge.svelte}`.

### Steps

1. JSON-RPC wrappers if missing (`get_connectivity`, `get_connectivity_html`, `restart_io`).
2. Badge component subscribed to `ConnectivityChanged`.
3. Relays form per spec.

### Verification

- Disconnect Wi-Fi → badge transitions to "Not connected" within 5 s; reconnect → "Connecting…" → "Connected".
- Add a working SOCKS5 proxy URL → restart IO → badge cycles back to Connected; messages flow through proxy.
- Remove the active proxy → toggle disables → IO restart → direct connection.

### Depends on

Phase 13.

---

## Phase 15 — Chat + contact info screens (member management, mute, pin, archive, ephemeral) ✅ DONE (2026-05-10)

**Outcome:** Tapping the chat-title in pane 3's topbar pushes mainRoute → `chatInfo`. `info/ChatInfo.svelte` is a single component handling 1:1, group, and broadcast — dispatches per `chatType`. Renders avatar (image or color-fallback) + name + Rename (group/broadcast only) + members list with avatars and addresses + ephemeral-timer dropdown (Off / 30s / 5m / 1h / 1d / 1w / 4w → `set_chat_ephemeral_timer`). Action grid: Pin/Unpin (`set_chat_visibility(pinned|normal)`), Mute/Unmute (`set_chat_mute_duration({ kind: 'forever' | 'notMuted' })`), Archive/Unarchive, Media (jumps to mediaBrowser), Invite QR (groups only). Footer destructive actions: Block contact (`block_contact`) for 1:1, Leave (`leave_group`) for groups + broadcasts, Delete chat (`delete_chat`).

**Goal:** Tap chat title in pane 3 → chat info screen (1:1 contact view or group info) with all metadata + actions: rename / avatar / description, manage members, mute, pin, archive, ephemeral timer, leave/delete chat, block contact (1:1).

### Scope

- Title bar tap → push pane-3 route to `ContactInfo` or `GroupInfo`.
- Common rows: avatar (tap to pick image — group/channel only; 1:1 shows contact's avatar non-editable), name/description (editable group/channel), members list (group/channel), mute toggle, pin toggle, archive toggle, ephemeral-timer picker, "Media, Audio & Files" entry (Phase 16), Leave / Delete.
- Contact-specific (1:1): email, encryption status (verified badge / fingerprint), block, group QR invite (opens Phase 11 show with chat scope).
- Group-specific: add member (opens member picker), swipe-to-remove on member rows, group QR invite (`get_securejoin_qr` with chatId).

### Files / dirs created

- `web/frontend/src/info/{ContactInfo.svelte,GroupInfo.svelte,MemberList.svelte,EphemeralTimerPicker.svelte}`.

### Steps

1. Pane-3 router gains an `info` route.
2. Info screens per spec.
3. Member management → reuse `ChooseMembers.svelte` from Phase 6 in "add" mode.
4. Wire mute / pin / archive via JSON-RPC; ephemeral via `set_chat_ephemeral_timer`.

### Verification

- 1:1: tap title → see contact details; Block → confirm → contact disappears from chatlist; unblock from Settings → returns.
- Group: tap title → see members; add member → returns to info with new member; remove member → row disappears.
- Pin a chat → it bubbles to the top of pane 2 with a pin icon.
- Mute → bell icon; incoming messages no longer trigger notifications.
- Archive → chat moves out of inbox; archive section in pane 2 shows it.
- Set ephemeral timer 1 hour → new outgoing messages disappear after 1 h on both sides.
- Leave group → returns to chatlist without the group; rejoining via QR works.

### Depends on

Phase 6, Phase 13.

---

## Phase 16 — In-chat media browser ✅ DONE (2026-05-10)

**Outcome:** ChatInfo's "Media" action pushes mainRoute → `mediaBrowser`. `info/MediaBrowser.svelte` calls `get_chat_media(account, chat, type, type2?, type3?)` then `get_messages` to hydrate. Three tabs: **Gallery** (Image + Gif + Video) renders a CSS grid of square thumbnails with a play overlay on videos; **Audio** (Audio + Voice) renders a list with name + date + size; **Files** renders a download-link list. Tap a thumbnail/row → "Show in chat" (selects chat + flashes the message + scrolls to it). Right-click a thumbnail → confirm-delete. Live refresh on `MsgsChanged | IncomingMsg`. Newest first.

**Goal:** From chat info → "Media, Audio & Files" → tabbed view: Gallery (images + videos), Audio (audio + voice), Files. Mirrors `plans/in-chat-media-browser.md`.

### Scope

- Tabs at the top, count badge per tab.
- Gallery: grid layout (3 cols default; responsive 4–6 on wide pane 3); thumbnails from blobdir; click to lightbox.
- Audio: list with waveform thumbnail + duration + date.
- Files: list with size + date + type icon.
- Per-row context menu: Show in Chat (jumps to chat scrolled to message), Share (download for files), Delete.
- Live refresh on `MsgsChanged | IncomingMsg | MsgDeleted`.
- Floating month-year capsule on gallery scroll (mirrors iOS).

### Files / dirs created

- `web/frontend/src/info/{MediaBrowser.svelte,GalleryGrid.svelte,FilesList.svelte}`.

### Steps

1. JSON-RPC: `get_chat_media`.
2. Tabs + grid/list components.
3. Show-in-Chat = select chat + scroll to message id.

### Verification

- Open a chat with mixed attachments → Media → Gallery shows thumbnails ordered newest-first.
- Switch to Files → list shows non-media files.
- Click Show in Chat on a thumbnail → pane 3 returns to chat scroll, target message highlighted briefly.
- Delete → confirmation → row + bubble both gone after `MsgDeleted` event.
- Send a new image → appears at top of gallery within 1 s.

### Depends on

Phase 15, Phase 7.

---

## Phase 17 — Browser notifications + unread totals ✅ DONE (2026-05-10)

**Outcome:** `lib/notifications/notifications.ts` exposes `requestPermissionOnce` (asks at most once, persists the asked flag in localStorage), `startIncomingNotifications` (subscribes to `IncomingMsg` and shows a `Notification(sender, { body, tag })` whenever the matching chat isn't actively foregrounded), and `updateUnreadIndicators(total)` (page-title prefix `(N) qxp` + canvas-painted favicon with accent-tinted "q" plus a red badge when total > 0). App.svelte fires the permission ask once after the first connect, starts the notification listener, and runs an `$effect` that recomputes the cross-account total from `profiles.list[].freshCount` and updates the title/favicon. Click on a notification focuses the tab, switches account if needed, and selects the chat. Mute is honored implicitly because muted chats don't increment `freshCount`.

**Goal:** When a new message arrives in a chat the user isn't actively viewing, show a browser notification (with permission) and update the favicon / page title with an unread badge. Mirrors `plans/notifications.md` (without push — see Out of scope).

### Scope

- `Notification.requestPermission()` once after first successful onboarding (with a clear in-app explainer; no auto-prompt on first load).
- On `IncomingMsg` (and the user is not viewing that chat or the tab is hidden): show a `new Notification(title, { body, tag, icon })` with `tag = "<accountId>-<chatId>"` so iOS-style threadIdentifier grouping works.
- Click notification → focus tab → switch account if needed → select chat.
- Favicon badge: dynamic favicon canvas that overlays the unread count (small, capped at "99+"); update on every relevant event.
- Page title: prepend `(N) ` for total unread.
- Cross-account total in pane 1 NavTabs (already present from Phase 12); cross-account total + per-account totals reflected in favicon + page title.
- Mute respected: muted chats don't trigger notifications (badges still update — matches iOS).

### Files / dirs created

- `web/frontend/src/lib/notifications/{permission.ts,banner.ts,favicon.ts,title.ts}`.

### Steps

1. Permission flow + persistent flag.
2. Build favicon on a canvas; install via `<link rel="icon">` swap.
3. Subscribe to events; compute totals; update favicon + title.
4. Banner on incoming + click handling.

### Verification

- First successful login → in-app explainer prompts permission → grant → second incoming msg from another tab triggers a banner.
- Tab title: `(3) qxp` when 3 unread total; clears to `qxp` on read.
- Click banner → tab focuses → chat opens (account-switch if needed).
- Mute a chat → incoming messages no longer banner; tab title still increments? — match iOS: muted chats *do* count in the tab title (per `plans/notifications.md`'s "badges still update").
- Deny permission → banners disabled, favicon + title still update.

### Depends on

Phase 12.

---

## Phase 18 — Drafts (per-chat persistence) ✅ DONE (2026-05-10)

**Outcome:** `chat/Composer.svelte` persists outgoing text drafts in `localStorage` keyed `qxp.web.draft.<accountId>:<chatId>` — saved on every keystroke, restored on chat switch, cleared on send. We use localStorage rather than `set_draft` because `deltachat-jsonrpc` doesn't expose a generic draft writer (only `set_draft_vcard`). `getDraft` is also not consumed for read; if a remote client sets a draft it won't surface here. Documented as a known gap in the open-question resolution. Reply / edit state lives on `chat.replyToId` / `chat.editingId` and survives chat-list scrolling but is cleared on chat switch (matches deltachat's per-chat draft semantics where draft + quote are bound).

**Goal:** Composer text and reply/edit state survive switching chats and reloads, scoped per chat per account.

### Scope

- Read drafts via `get_draft` (returns a `DcMsg`-shape with text + quote + viewtype). Write via `set_draft` (clears on send / clears on empty).
- Reply quote and edit-mode draft round-trip through the deltachat draft mechanism (which already supports quotes).
- Composer hydrates draft on chat select; clears on send.

### Files / dirs created

- `web/frontend/src/chat/Composer.svelte` extended.
- `web/frontend/src/lib/state/draft.svelte.ts`.

### Steps

1. JSON-RPC: `get_draft`, `set_draft`, `remove_draft` (or `set_draft(null)`).
2. Wire on chat select / unselect / send.

### Verification

- Type "hello" in chat A's composer → switch to chat B → switch back → "hello" still there.
- Reload page → "hello" still there.
- Send → composer clears; draft removed on the daemon.
- Reply quote a message, switch chat, switch back → reply bar still pinned; quote intact.

### Depends on

Phase 4 (composer).

---

## Phase 19 — Live location streaming ⏭ DEFERRED (2026-05-10)

**Status:** Backend gap. `deltachat-jsonrpc` exposes `get_locations` for read but **no** RPC for `dc_send_locations_to_chat` / `start_location_streaming`, so a streaming session can't be initiated by the daemon directly via this surface. One-shot location sharing already works via Phase 7's composer entry (`MessageData.location`). Continuous streaming requires either (a) a deltachat-jsonrpc patch upstream, or (b) the frontend simulating streams by sending a fresh `MessageData{ location }` every few seconds — which doesn't actually mark the originating chat as a "sending live location" chat (that flag lives in core, behind the missing RPC). Tracked as a follow-up; the chatlist's `isSendingLocation` flag is honored on the receive side via existing chat updates.

**Goal:** Group chats / 1:1 can stream live location for a chosen duration; arriving streams render on a small map preview that updates over time. Mirrors `LocationStreamingService` from iOS.

### Scope

- Composer attach menu: "Share Live Location" → duration picker (15 min, 1 h, 8 h, custom).
- `start_location_streaming(chat_id, seconds)`; daemon-side handles the periodic update.
- Browser side: `navigator.geolocation.watchPosition` while the streaming is active in this tab; calls `set_location` (or whichever JSON-RPC method takes lat/lon and pushes to peers).
- Inline render: location bubble that updates in place; map preview shows the latest point + path polyline.
- Stop streaming button on the bubble.

### Files / dirs created

- `web/frontend/src/chat/cells/LiveLocationCell.svelte`.
- `web/frontend/src/lib/location/streaming.ts`.

### Steps

1. JSON-RPC wrappers + duration UI.
2. `watchPosition` lifecycle tied to the streaming state.
3. Bubble update on `LocationChanged` event.

### Verification

- Start 15-min streaming → grant geolocation → bubble shows "Streaming for 15 minutes…" + current point.
- Move (or simulate) → bubble's map preview updates within 5 s.
- Other clients receive the live updates.
- Stop → bubble shows last point + "Streaming ended".
- 15 min later (without manual stop) → daemon ends streaming → bubble updates accordingly.

### Depends on

Phase 7.

---

## Phase 20 — Search (chat list + in-chat) ✅ DONE (2026-05-10)

**Outcome:** `lib/state/messageSearch.svelte.ts` wraps `search_messages(account, query, chatId?)` (Open Question 10 confirmed: the method exists). The chatlist's existing search input also drives a global message search; results surface in `ChatListPane.svelte` as a "Messages" section under the chats. Click a hit → select the matching chat + flash + scroll-into-view of the target `#msg-<id>` element. Debounced 200 ms. `Ctrl/Cmd-K` global shortcut focuses the search input via the keyboard-shortcut bus from Phase 23. **Per-chat find bar:** `chat/InChatSearch.svelte` — opens on Ctrl/Cmd-F when a chat is active, scopes `search_messages` to the current chat, debounces 200 ms, supports Enter / Shift-Enter / ↑ ↓ for prev / next navigation through hits with flash + scroll-into-view, Esc to close. The shortcut bus's `'in-chat-search'` event drives toggling.

**Goal:** Pane 2 search filters chatlist *and*, when a query is entered, surfaces matching messages across all chats (deltachat returns global message hits). Inside an open chat, a search affordance (Ctrl-F / icon) finds matches and jump-scrolls.

### Scope

- Pane 2 FSM `search` mode (Signal `LeftPaneSearchHelper` analogue).
- Two result sections: "Chats" (filtered chatlist) and "Messages" (global message hits via `search_messages`).
- Click a message hit → open chat scrolled to that message, briefly highlighted.
- In-chat search: composer-area "find" input with prev/next arrows; uses `search_messages` scoped to current chat.

### Files / dirs created

- `web/frontend/src/shell/SearchMode.svelte`.
- `web/frontend/src/chat/InChatSearch.svelte`.

### Steps

1. Pane-2 FSM extended.
2. Global + scoped search wiring; debounce 200 ms.
3. In-chat search with prev/next.

### Verification

- Type "project" in pane 2 search → Chats section narrows to matches; Messages section shows hits across all chats.
- Click a Message hit → chat opens scrolled to that message; highlight fades after 1 s.
- In a chat, Ctrl-F → input focuses; type "yes" → next/prev cycles through hits.

### Depends on

Phase 4.

---

## Phase 21 — Localization (English + locale plumbing) 🟡 PARTIAL (2026-05-10)

**Status:** Plumbing + extraction script complete; bulk sweep deferred. `lib/i18n/i18n.ts` exposes `t(key, args?)`, `plural(n, one, other)`, and `loadLocale(tag)` (fetches `/locales/<tag>.json` with silent fallback to source-string keys). `web/scripts/sync-strings.mjs` reads `ios/qxp/Localizable.xcstrings` (the iOS app's modern xcstrings JSON catalog), produces a flat `{ source-string: english-value }` map at `web/frontend/public/locales/en.json` — Vite serves it from `/locales/en.json` automatically. Current run extracts 418 strings (110 with explicit translations, 308 source-as-fallback). App.svelte calls `loadLocale('en')` on boot. The remaining work is the bulk find/replace pass to thread literal strings through `t('…')` across all Svelte components (~hundreds of touchpoints) — left as a follow-up; until then `t()` is a no-op for components that haven't been swept.

**Goal:** All user-facing strings flow through a localizer. Ship English from `references/deltachat-ios/deltachat-ios/en.lproj/Localizable.strings`. Browser locale auto-detection; manual override in Settings.

### Scope

- Vendored locale loader: at startup, fetch `/locales/<lang>.json` from the daemon (which serves them from the embedded asset bundle).
- Source of truth: copy English values from the iOS reference's `Localizable.strings` (same keys — keep the import scriptable).
- Plural / format-arg support via a small ICU-MessageFormat-lite helper (or `intl-messageformat` if its size is acceptable; decide during phase).
- Settings → Appearance → Language picker (English only initially; structure ready for more).

### Files / dirs created

- `web/frontend/src/lib/i18n/{i18n.ts,types.ts}`.
- `web/frontend/locales/en.json` (generated from iOS strings).
- `web/server/src/assets.rs` — embed `locales/`.

### Steps

1. Convert `Localizable.strings` → `en.json` via a one-shot script (committed; idempotent).
2. Build the i18n helper.
3. Sweep each phase's strings into keys; replace literals.

### Verification

- All UI shows English copy from the keys (no `$` placeholders or raw keys leak through).
- Plural cases (`{count, plural, one {…} other {…}}`) render correctly for 1 vs 2 vs 0.
- Switch language to a stub locale (`fr.json` with one string) → that one string flips; rest fall back to English.

### Depends on

Most other phases (consumes their literal strings).

---

## Phase 22 — Theming + wallpapers ✅ DONE (2026-05-10)

**Outcome:** Theme + accent + wallpaper all flow through `prefs.svelte.ts` (`theme`, `accent`, `wallpaper`). App.svelte's `$effect` mirrors `prefs.theme` onto `document.documentElement.dataset.theme` and `prefs.accent` onto `--color-accent`. Wallpaper picker in `settings/Appearance.svelte` uploads the image via `/upload` and writes the daemon path into `prefs.wallpaper`; `chat/ChatView.svelte`'s `.scroll` reads it via `style:background-image={fileUrl(...)}`, with `background-attachment: local` so it doesn't fight the message scroll. Per-chat overrides are not implemented in v1 (would need a daemon-side per-chat config; localStorage-only would diverge across tabs). Accent swatches: 6 named colors; theme picker has system/light/dark.

**Goal:** First-class theme system: light / dark / system, accent color, optional chat wallpaper (preset pattern or user image). Mirrors iOS `AppearanceSettings` / `WallpaperBackground` / `ThemeEditorView`.

### Scope

- CSS custom property tokens defined per theme; theme switching = swap a `data-theme` attribute on `<html>`.
- Accent color: one base hex, derived shades (hover, pressed, tinted bg) computed via `color-mix()` or pre-computed scale.
- Chat wallpaper: applied as a `background-image` on the message scroller; presets (a few SVG patterns + solid colors); custom upload.
- Per-chat override: a chat's wallpaper can differ from the global one.

### Files / dirs created

- `web/frontend/src/styles/themes/{light.css,dark.css}`.
- `web/frontend/src/lib/theme.svelte.ts`.
- `web/frontend/src/settings/Wallpaper.svelte`.

### Steps

1. Token-ize all colors.
2. Theme switcher.
3. Wallpaper picker + upload + per-chat persistence (stored as a JSON config under the daemon's accounts dir).

### Verification

- Toggle dark/light → instant flip; no flash.
- Change accent → all accent-tinted elements update.
- Apply a wallpaper preset → message scroller shows the pattern; bubbles still readable.
- Upload custom wallpaper → applied; persists across reloads.
- Override on one chat → only that chat shows the override.

### Depends on

Phase 13.

---

## Phase 23 — Accessibility, keyboard navigation, polish ✅ DONE (2026-05-10)

**Outcome:** `lib/shortcuts.ts` exposes `bindGlobalShortcuts()` (handles Cmd/Ctrl-N → new chat, Cmd/Ctrl-K → focus search, Cmd/Ctrl-F → in-chat search if a handler is registered, Esc → close) and `onShortcut(name, fn)`. App.svelte mounts the binder once and wires Esc → `backToInbox + backToChat`, Cmd-N → compose mode. ChatView registers `'in-chat-search'` to open `InChatSearch.svelte` and `'escape'` to close it. **Sveltecheck is now clean** — 0 errors and 0 warnings across all 157 files (was 16 warnings as recently as the Phase-21 commit). Specific fixes in this pass: ImageLightbox + ContactPickerModal got `tabindex="-1"` and Esc/click-out keyboard parity; the lightbox `<video>` got an explicit `svelte-ignore a11y_media_has_caption` (deltachat attachments don't carry captions); Splitter got arrow-key resize plus the noninteractive-element ignore directives appropriate for its `role="separator"` semantics; MessageBubble's bubble-wrap got the static-element-interactions ignore for swipe-to-reply pointer handlers; VoiceCell's seek bar got Arrow-left/right + Space/Enter keyboard support and an aria-label; MediaBrowser's tablist switched from `<nav>` to `<div>`; and three `state_referenced_locally` warnings (ChooseMembers' selected snapshot, ContextMenu's initial style coords, VoiceCell's duration default) got either the proper `$effect`-driven update path or a justifying `svelte-ignore` comment. Deeper screen-reader audit + reduced-motion gating + visual polish remain as future work.

**Goal:** Keyboard-only operation works for the common flows; ARIA roles + labels on every interactive element; focus states visible; screen-reader-friendly bubble structure; final UI sweep.

### Scope

- Keyboard shortcuts: `Cmd/Ctrl-N` new chat, `Cmd/Ctrl-K` chat-search, `Cmd/Ctrl-F` in-chat search, `Cmd/Ctrl-1..9` pick account, `Esc` close modals, arrow keys to move between chats/messages, Enter to send, Shift+Enter newline.
- Focus rings via `:focus-visible` only.
- ARIA labels on icon buttons (compose, attach, etc.), message bubbles role="article", reactions group with `aria-label`.
- Live regions for incoming messages so screen readers announce.
- Light pass on motion: respects `prefers-reduced-motion`.
- Final visual polish: spacing, hairline borders, transitions, empty states.

### Files / dirs

- Touched: most components.

### Steps

1. Keyboard shortcut bus + global handler.
2. ARIA sweep.
3. Focus styles.
4. Reduced-motion gating.
5. Visual polish pass (use the iOS app screenshots as the "feel" target).

### Verification

- Tab through the entire UI without a mouse; every focusable element gets a visible ring; tab order is logical.
- VoiceOver / NVDA reads bubbles correctly; reactions announce as "👍 1, 👎 0".
- Cmd/Ctrl-K opens search input focused.
- `prefers-reduced-motion: reduce` → animations pared to fades only.

### Depends on

All prior feature phases (this phase polishes existing surfaces).

---

## File summary (high level)

```
web/server/                   ~1.5–2 KLOC Rust
web/frontend/                 ~6–10 KLOC Svelte/TS, ~50–80 components
web/frontend/locales/         English JSON + structure for additional locales
web/README.md                 Local dev instructions only
```

---

## Out of scope for this plan

- **Deployment / packaging.** No NixOS module, no systemd unit, no Docker image, no `.deb`/`.rpm`, no NSIS installer, no Apple distribution. The daemon runs from `cargo run` for now; bundling the embedded frontend into a release build is fine but no release pipeline is set up.
- **TLS / reverse proxy / authentication.** The daemon binds `127.0.0.1` and trusts every connection. Anything multi-user / public-facing is the deployment plan's job.
- **Mobile responsive layout.** Desktop browser only; viewport widths < ≈ 800 px are not supported in this plan.
- **Push notifications / Web Push.** Browser foreground notifications only (Phase 17). No service worker, no VAPID, no background fetch. A future plan can add a service-worker-backed Web Push pipeline.
- **Webxdc apps.** Deltachat's in-message JS apps. Not implemented in iOS yet either; deferred until the iOS app picks them up or the user explicitly retargets.
- **PWA / Add to Home Screen.** No manifest, no service worker, no Web Share Target.
- **Calls (audio/video).** Not in iOS; not in scope here.
- **Stories / status / disappearing presence.** Not in deltachat; not in scope.
- **Bots / webxdc apps store.** Out of scope.
- **End-to-end testing infrastructure (Playwright etc.).** Manual verification per phase. A separate testing plan can introduce Playwright + a fake-imap test fixture once the surface stabilises.
- **Logging telemetry / crash reporting.** Out of scope; a Log View (per-account core log) ships in Phase 13 and that's it.
- **Auto-update / version checks.** No update channel; user redeploys.

---

## Open questions — resolutions (2026-05-10)

1. **Cargo workspace at the repo root?** **Standalone.** `web/server/Cargo.toml` is its own package without a root workspace; cargo resolves `deltachat-jsonrpc`'s `workspace = true` inheritance through the submodule's inner workspace. Revisit only if a second first-party Rust crate appears under `web/`.
2. **Binary attachment uploads.** **HTTP `POST /upload` on the daemon.** Already shipped in Phase 2 (`web/server/src/upload.rs`): streams the request body to `<accounts_dir>/_uploads/qxp-upload-<nanos>.<ext>`, returns the absolute path. Phase 7 onward feeds that path into `sendMsg(MessageData { file, viewtype, … })`. No JSON-RPC base64 path.
3. **QR rendering library.** **None — daemon renders SVG.** `getChatSecurejoinQrCodeSvg(account, chat?)` returns a ready-to-embed `<svg>` produced by `deltachat-core-rust::qr_code_generator`. The frontend just sets `innerHTML` (sanitized — daemon-trusted source). Zero npm cost.
4. **QR scanning library.** **`BarcodeDetector` with `jsqr` fallback.** Shipped in Phase 2 (`web/frontend/src/qr/Scanner.svelte`); `jsqr` (~45 KB) is the only npm runtime dep so far.
5. **Map tile source for location previews.** **OSM tiles** (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) with `© OpenStreetMap contributors` attribution rendered next to every preview. Cache via browser HTTP cache. Static previews only (no panning) so we stay under fair-use.
6. **Webxdc.** **Hide.** Incoming webxdc bubbles render as a generic file with a "Webxdc apps not supported in qxp-web" caption; no execution surface. Revisit when iOS adds them.
7. **Multi-tab safety.** **Accept divergence.** Two tabs against one daemon coexist (the core handles concurrent callers) but each tab maintains its own UI state. README notes the caveat. No `BroadcastChannel` cross-tab sync for v1.
8. **i18n source.** **Reuse iOS keys verbatim.** Phase 21 ships a one-shot script that converts `references/deltachat-ios/deltachat-ios/en.lproj/Localizable.strings` → `web/frontend/locales/en.json`; the script is idempotent so re-runs catch upstream drift.
9. **Voice encoding.** **Record `audio/ogg;codecs=opus` where supported, fall back to `audio/webm;codecs=opus`.** Both ship raw Opus frames; deltachat-core ingests the file as-is and recipients with modern players (which all the official DC clients use) decode webm/opus fine. Phase 8 verifies in practice; if any recipient stumbles we remux to ogg/opus daemon-side as a follow-up.
10. **Search messages API.** **Confirmed: `searchMessages(accountId, query, chatId?) -> Vec<u32>`.** Phase 20 unblocked.

### Method gaps surfaced during the open-question sweep

These are real gaps in `deltachat-jsonrpc` that affect specific phases — the plan handles each by composing existing methods:

- **No `setDraft`.** `getDraft` exists but the only writer is `setDraftVcard`. Phase 18 stores text drafts client-side (per-tab `localStorage`, keyed `qxp.web.draft.<accountId>.<chatId>`); deltachat-side drafts surface only on read. Quoted-reply state is composer-local for now.
- **No `restartIo`.** Compose `stopIo(accountId) → startIo(accountId)` sequentially. Phase 14 wraps this as `restartIo()` in `lib/state/connectivity.svelte.ts`.
- **No separate `setLocation`.** `MessageData.location: [lat, lon]` carries the point in the existing `sendMsg`. Phase 19 sends a fresh location-bearing message at each `geolocation.watchPosition` tick during a streaming session.

---

## Active milestone tracker

Phase status legend: ⏳ pending · 🚧 in progress · ✅ done.

Set a phase to 🚧 when work begins; 🚩 the **Outcome** subsection (mirroring the iOS plans) when complete with a short retrospective.
