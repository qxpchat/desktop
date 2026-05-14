# qxp — desktop

Tauri 2 desktop app. See root `AGENTS.md` for cross-platform conventions; this file only covers desktop-specific state.

## Layout

- `server/` — Rust crate `qxp-web` (axum + yerpc + `deltachat-jsonrpc`).
- `frontend/` — Svelte 5 + Vite SPA. State in `frontend/src/lib/state/*.svelte.ts`.
- `src-tauri/` — Tauri 2 shell. Spawns the daemon in-process; opens a native window.

See `desktop/README.md` for run/build/account-data details.

## Reuse — don't re-implement

- `lib/Modal.svelte` — overlay + card + Escape + backdrop. `size`, `role`.
- `lib/Button.svelte` — `variant` × `size` + `block`.
- `lib/Popover.svelte` — anchored menu + viewport clamp + Escape.
- `lib/SettingsRow.svelte` + `lib/SettingsSection.svelte` — Signal-style settings rows.
- `lib/Avatar.svelte` — image + initials fallback.
- `lib/format/timestamp.ts` — `formatRelativeTimestamp`, `formatShortTime`, `formatDayLabel`.
- `lib/format/openstreetmap.ts` — `osmEmbedUrl`, `osmShareUrl`.
- `lib/format/linkify.ts`, `lib/format/youtube.ts` — text helpers.
- `lib/state/*.svelte.ts` — only surface for daemon mutations. Components doing `rpc.call(...)` directly is a boundary leak. PascalCase wire-tag unions unwrap at the state-module boundary, never in components.

## Refuse

- **Mixed timing fences** — `tick()` / `setTimeout` / `requestAnimationFrame` / event waits interleaved in one flow. Pick one.
- **Per-chat / per-account client-side flags duplicating the daemon's mirror** — mute, pin, archive, freshness, proxy-enabled.
- **`{#key}` for teardown** — discards scroll/animation state; usually means reactivity wasn't wired up.
- **Inline RPC wire-shape checks in components** — `r.kind === 'message'`, `item.kind === 'ChatListItem'`. Unwrap at the state-module boundary.
- **macOS-only code without alternatives** — `objc2` / AppKit / Mach-O linker tricks need either a working Linux/Windows equivalent or an explicit `#[cfg]`-gated no-op + comment justifying why "do nothing" is correct.
