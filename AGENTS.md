# qxp

qxp is a cross-platform client for the delta chat protocol.

## Project state

- **Platform scope (current milestone):** iOS 26+ only. macOS/other platforms deferred.
- **UI:** SwiftUI, Signal-like minimalism, latest Apple HIG, Liquid Glass design only. Use iOS 26 native materials and modifiers — no custom blurs, no legacy bar tinting, no pre-Liquid-Glass variants when a newer one exists.
- **Dependencies:** only `libdeltachat.a` (compiled from deltachat-core-rust). Zero Swift/ObjC package deps.
- **Reference implementation:** `resources/deltachat-ios/` — the official UIKit client. Use for inspiration only; do not import.
- **Hardening:** strict concurrency complete, warnings-as-errors, TSan/ASan clean, 71 tests (28 pure logic + 41 integration).
- **Project layout:** `qxp/Core/` Swift wrappers over `libdeltachat.a`; `qxp/State/` `@Observable @MainActor` view models (`AppState`, `ChatListViewModel`, `ChatViewModel`); `qxp/Views/` SwiftUI. Entry in `qxpApp.swift` routes `ProgressView → LoginView → ChatListView` via `AppState.isReady`/`isLoggedIn`. Events fan out via Combine `PassthroughSubject` on `AppState.events`.
- **Active plan:** none. Latest completed: `plans/chatview-bugfix-pass.md` — fixed reaction-overlap, opaque self-reaction pills, live reaction rendering via `snapshot.reconfigureItems`, initial-scroll FSM driven by `viewSafeAreaInsetsDidChange`, always-glass nav bar via `scrollEdgeAppearance == standardAppearance`, and `ChatInputBar` `UIBlurEffect` → `UIGlassEffect`. Prior: `plans/chatview-uikit-rewrite.md`. Completed plans archive under `plans/`.

## Approach

-   Minimalism: do not invent ANYTHING, do everything max idiomatic way with no dependencies or custom code whenever possible.
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
