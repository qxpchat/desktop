# qxp — desktop

qxp is a desktop client for the delta chat protocol — a Tauri 2 app: a Rust
daemon (`server/`, the `qxp-web` crate bridging `deltachat-jsonrpc` over a
loopback WebSocket), a Svelte 5 + Vite SPA (`frontend/`), and a Tauri 2 shell
(`src-tauri/`). Builds to a single native binary per OS (Linux / macOS /
Windows); also runnable headless via `make server` + `make ui`.

User instructions **always** override this file.

## Active platform

- The user is currently only running and testing on **macOS** (WKWebView). Linux/Windows desktop paths are not being exercised right now — prioritize macOS-correct fixes and call out cross-platform implications instead of silently assuming parity.

## Versioning

Bump the version on every change that ships behavior. **Always use the script — never hand-edit the version files.**

```
scripts/sync-versions.sh             # print current, exit 1 on drift
scripts/sync-versions.sh bump patch  # bug fix
scripts/sync-versions.sh bump minor  # feature
scripts/sync-versions.sh bump major  # breaking change
scripts/sync-versions.sh set 1.2.3   # explicit
```

What each bump means:

- **Bug fix → patch** (rightmost): `0.1.0` → `0.1.1`.
- **Feature → minor** (middle), patch resets to 0: `0.1.3` → `0.2.0`.
- **Breaking change → major** (leftmost), the rest reset: `0.2.5` → `1.0.0`.

The script keeps the four version sites in lock-step (`frontend/package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `server/Cargo.toml`). The plain run (no args) verifies they agree — use it before sending a PR.

Pure refactors, doc-only edits, and internal cleanup that ships no user-visible behavior do not bump.

## Repository layout

- `server/` — Rust crate `qxp-web` (axum + yerpc + `deltachat-jsonrpc`). Compiles to a library (used by the Tauri shell) AND a standalone binary (`cargo run` for headless dev).
- `frontend/` — Svelte 5 + Vite SPA. State in `frontend/src/lib/state/*.svelte.ts`.
- `src-tauri/` — Tauri 2 shell. Spawns the daemon in-process; opens a native window.
- `tests/` — Playwright E2E suite. See `tests/README.md`.
- `scripts/` — version sync, string sync, and other dev scripts.
- `libs/` — Rust core (`deltachat-core-rust` submodule) and patches.
- `plans/` — plan history and active plan. Only read on explicit requests.

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
- `lib/state/*.svelte.ts` — only surface for daemon mutations. Components doing `rpc.call(...)` directly is a boundary leak. PascalCase wire-tag unions unwrap at the state-module boundary, never in components.

## Refuse

- **Mixed timing fences** — `tick()` / `setTimeout` / `requestAnimationFrame` / event waits interleaved in one flow. Pick one.
- **Per-chat / per-account client-side flags duplicating the daemon's mirror** — mute, pin, archive, freshness, proxy-enabled.
- **`{#key}` for teardown** — discards scroll/animation state; usually means reactivity wasn't wired up.
- **Inline RPC wire-shape checks in components** — `r.kind === 'message'`, `item.kind === 'ChatListItem'`. Unwrap at the state-module boundary.
- **macOS-only code without alternatives** — `objc2` / AppKit / Mach-O linker tricks need either a working Linux/Windows equivalent or an explicit `#[cfg]`-gated no-op + comment justifying why "do nothing" is correct.

## Approach

- Be very concise in output but thorough in reasoning.
- Think before acting and make absolutely sure you understand the problem before trying to solve it. 
- Always ask for clarifications in case of doubts. Never guess. Check reference apps.
- Challenge the user if their inputs are inconsistent with your reasoning.
- Avoid dependencies at any costs as long as they are not strictly necessary. If you need to use a library, make sure it is widely used and well maintained.
- Do not re-read files you have already read unless the file may have changed.
- Keep solutions simple and direct. No over-engineering. Do not invent things if possible, do everything in an idiomatic way.

## Control

- Never execute mutable Git commands: the user needs to review all your changes.
- **Never** execute mutable system commands without user's explicit confirmation unless they asked you to do so.

## Efficiency

- Always think ahead and try to optimize your steps to reduce the token expense.
- If you nee to consume a really big input, get a user confirmation.

## Code

- For every bug, first implement a new e2e test if possible, then write a fix.
- **Priority order:** (1) **DRY** — same logic / predicate / mapping / CSS shape in ≥2 places must be factored into a single source of truth; soft duplication counts (same shape, different names; parallel switches; near-identical CSS blocks). (2) **Acyclic deps** — modules importing each other is fine if boundaries are clear (exports = intent, not implementation) and the graph is acyclic; flag cycles and boundary smears (UI reaching into a state-module's private internals). (3) **Delete-by-default** — among survivors of (1)+(2), the shortest correct program wins; for every line ask "what observable behaviour changes if I remove this?" If "nothing", remove it.
- **Steel-man the inverse before applying any change.** Construct the strongest case *against* doing it; if the steel-man wins, skip. Don't ship findings that are speculation, stylistic preference, or imagined future reuse — those are observations, not findings.
- **Bar for a new abstraction: ≥2 real existing call sites.** Imagined future reuse doesn't count. Three similar lines beat a premature helper.
- **Validate at system boundaries (user input, RPC wire). Trust internal code.** Impossible-state defensive checks are noise.
- **No backwards-compat shims.** qxp is pre-1.0; `_unused` renames, re-exports for old paths, deprecation aliases — delete them.
