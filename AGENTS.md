# qxp

qxp is a cross-platform client for the delta chat protocol.

## Project state

- **Platform scope (current milestone):** iOS 18+ only. macOS/other platforms deferred.
- **UI:** SwiftUI, Signal-like minimalism, latest Apple HIG.
- **Dependencies:** only `libdeltachat.a` (compiled from deltachat-core-rust). Zero Swift/ObjC package deps.
- **MVP scope:** email+password login (IMAP/SMTP), chat list, chat view, send/receive text. No groups/media/settings yet.
- **Reference implementation:** `resources/deltachat-ios/` — the official UIKit client. Use for inspiration only; do not import.
- **Implementation plan:** see `PLAN.md` at repo root (6 phases, 17 new files).
- **Current status:** plan approved 2026-04-12; Phase 0 (Rust core build + Xcode wiring) not yet started.

## Approach

-   Think before acting. Read existing files before writing code.
-   Be very concise in output but thorough in reasoning.
-   Do not re-read files you have already read unless the file may have changed.
-   Keep solutions simple and direct. No over-engineering.
-   If unsure: say so. Never guess or invent anything.
-   User instructions always override this file.

## Efficiency

-   Read before writing. Understand the problem before coding.
-   No redundant file reads. Read each file once.
-   One focused coding pass. Avoid write-delete-rewrite cycles.
-   Work efficiently, think ahead.
