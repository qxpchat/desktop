# qxp

qxp is a cross-platform client for the delta chat protocol.
User instructions **always** override this file.

## Repository layout

- `ios/` — iOS app (SwiftUI), share extension, tests, Xcode project, iOS-only build scripts. Currently on hold. **For iOS work, also read `ios/AGENTS.md`** — it has iOS-specific project state, layout, and active plans.
- `desktop/` — Tauri 2 desktop app: Rust daemon (`server/`, `qxp-web` crate bridging `deltachat-jsonrpc` over a loopback WebSocket), Svelte 5 + Vite SPA (`frontend/`), Tauri shell (`src-tauri/`). Builds to a single native binary per OS (Linux / macOS / Windows); also runnable headless via `make server` + `make ui`. See `desktop/README.md` for run / build / account-data layout.
- `libs/` — Rust core (`deltachat-core-rust` submodule), patches, and the `notifiers` submodule.
- `notifier/`, `relay/` — server-side: notifier deploy scaffold and chatmail relay.
- `references/` — third-party reference implementations (read-only inspiration).
- `plans/`, `PLAN.md` — plan history and active plan. Only read on explicit requests.

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
