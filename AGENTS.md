# qxp — desktop

qxp = desktop client for delta chat protocol. Tauri 2 app: Rust daemon (`server/`, `qxp-web` crate bridge `deltachat-jsonrpc` over loopback WebSocket), Svelte 5 + Vite SPA (`frontend/`), Tauri 2 shell (`src-tauri/`). Builds to single native binary per OS (Linux / macOS / Windows); also headless via `make server` + `make ui`.

User instructions **always** override this file.

## Active platform

- User now run + test only on **macOS** (WKWebView). Linux/Windows desktop paths not exercised — prioritize macOS-correct fixes, call out cross-platform implications, no silent parity assume.

## Versioning

Bump version on every change that ships behavior. **Always use script.**

```
scripts/sync-versions.sh             # print current, exit 1 on drift
scripts/sync-versions.sh bump patch  # bug fix
scripts/sync-versions.sh bump minor  # feature
scripts/sync-versions.sh bump major  # breaking change
scripts/sync-versions.sh set 1.2.3   # explicit
```

Each bump meaning:

- **Bug fix → patch** (rightmost): `0.1.0` → `0.1.1`.
- **Feature → minor** (middle), patch resets to 0: `0.1.3` → `0.2.0`.
- **Breaking change → major** (leftmost), rest reset: `0.2.5` → `1.0.0`.

Script keeps four version sites in lock-step (`frontend/package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `server/Cargo.toml`). Plain run (no args) verifies they agree — use before PR.

Pure refactors, doc-only edits, internal cleanup shipping no user-visible behavior do not bump.

## Repository layout

- `server/` — Rust crate `qxp-web` (axum + yerpc + `deltachat-jsonrpc`). Compiles to library (used by Tauri shell) AND standalone binary (`cargo run` for headless dev).
- `frontend/` — Svelte 5 + Vite SPA. State in `frontend/src/lib/state/*.svelte.ts`.
- `src-tauri/` — Tauri 2 shell. Spawns daemon in-process; opens native window.
- `tests/` — Playwright E2E suite. See `tests/README.md`.
- `scripts/` — version sync, string sync, other dev scripts.
- `libs/` — Rust core (`deltachat-core-rust` submodule) + patches.
- `plans/` — plan history + active plan. Read only on explicit request.

See `README.md` for run / build / account-data layout.

## Reuse — don't re-implement

- `lib/Modal.svelte` — overlay + card + Escape + backdrop. `size`, `role`.
- `lib/Button.svelte` — `variant` × `size` + `block`.
- `lib/Popover.svelte` — anchored menu + viewport clamp + Escape.
- `lib/SettingsRow.svelte` + `lib/SettingsSection.svelte` — Signal-style settings rows.
- `lib/Avatar.svelte` — image + initials fallback.
- `lib/format/timestamp.ts` — `formatRelativeTimestamp`, `formatShortTime`, `formatDayLabel`.
- `lib/format/openstreetmap.ts` — `osmEmbedUrl`, `osmShareUrl`.
- `lib/format/linkify.ts`, `lib/format/youtube.ts` — text helpers.
- `lib/state/*.svelte.ts` — only surface for daemon mutations. Components doing `rpc.call(...)` directly = boundary leak. PascalCase wire-tag unions unwrap at state-module boundary, never in components.

## Refuse

- **Mixed timing fences** — `tick()` / `setTimeout` / `requestAnimationFrame` / event waits interleaved in one flow. Pick one.
- **Per-chat / per-account client-side flags duplicating daemon's mirror** — mute, pin, archive, freshness, proxy-enabled.
- **`{#key}` for teardown** — discards scroll/animation state; usually means reactivity not wired up.
- **Inline RPC wire-shape checks in components** — `r.kind === 'message'`, `item.kind === 'ChatListItem'`. Unwrap at state-module boundary.
- **macOS-only code without alternatives** — `objc2` / AppKit / Mach-O linker tricks need either working Linux/Windows equivalent or explicit `#[cfg]`-gated no-op + comment justifying why "do nothing" correct.

## Approach

- Concise output, thorough reasoning.
- Think before act. Make sure understand problem before solve.
- Ask clarification on doubt. Never guess. Check reference apps.
- Challenge user if inputs inconsistent with your reasoning.
- Avoid dependencies at all cost unless strictly necessary. If need library, pick widely used + well maintained.
- Don't re-read files already read unless file may have changed.
- Keep solutions simple + direct. No over-engineering. Don't invent; do everything idiomatic.

## Control

- Never run mutable Git commands: user needs review all changes.
- **Never** run mutable system commands without user explicit confirmation unless they asked.

## Efficiency

- Think ahead, optimize steps to cut token expense.
- If consume really big input, get user confirmation.

## Code

- For every bug, first add new e2e test if possible, then write fix.
- **Priority order:** (1) **DRY** — same logic / predicate / mapping / CSS shape in ≥2 places must factor into single source of truth; soft duplication counts (same shape, different names; parallel switches; near-identical CSS blocks). (2) **Acyclic deps** — modules importing each other fine if boundaries clear (exports = intent, not implementation) + graph acyclic; flag cycles + boundary smears (UI reaching into state-module private internals). (3) **Delete-by-default** — among survivors of (1)+(2), shortest correct program wins; for every line ask "what observable behaviour changes if I remove this?" If "nothing", remove.
- **Steel-man the inverse before applying any change.** Build strongest case *against* doing it; if steel-man wins, skip. Don't ship findings that are speculation, stylistic preference, or imagined future reuse — those observations, not findings.
- **Bar for new abstraction: ≥2 real existing call sites.** Imagined future reuse no count. Three similar lines beat premature helper.
- **Validate at system boundaries (user input, RPC wire). Trust internal code.** Impossible-state defensive checks = noise.
- **No backwards-compat shims.** qxp pre-1.0; `_unused` renames, re-exports for old paths, deprecation aliases — delete them.