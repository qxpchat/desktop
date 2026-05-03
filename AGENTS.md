# qxp

qxp is a cross-platform client for the delta chat protocol.

## Project state

- **Platform scope (current milestone):** iOS 26+ only. macOS/other platforms deferred.
- **UI:** SwiftUI, Signal-like minimalism, latest Apple HIG, Liquid Glass design only. Use iOS 26 native materials and modifiers — no custom blurs, no legacy bar tinting, no pre-Liquid-Glass variants when a newer one exists.
- **Dependencies:** only `libdeltachat.a` (compiled from deltachat-core-rust). Zero Swift/ObjC package deps.
- **Reference implementation:** `references/deltachat-ios/` — the official UIKit client. Use for inspiration only; do not import.
- **Hardening:** strict concurrency complete, warnings-as-errors, TSan/ASan clean, 71 tests (28 pure logic + 41 integration).
- **Project layout:** `qxp/Core/` Swift wrappers over `libdeltachat.a`; `qxp/State/` `@Observable @MainActor` view models (`AppState`, `ChatListViewModel`, `ChatViewModel`); `qxp/Views/` SwiftUI. Entry in `qxpApp.swift` routes `ProgressView → LoginView → ChatListView` via `AppState.isReady`/`isLoggedIn`. Events fan out via Combine `PassthroughSubject` on `AppState.events`.
- **Active plan:** `PLAN.md` — Push Notifications (drafted, awaiting approval). Adds APNs pipeline behind the existing local-notifications layer; requires forking `libs/deltachat-core-rust` to swap notifier URL + PGP key + dual-register, plus a `qxpNSE` Notification Service Extension target. Hard prereq tracked off-repo: qxp-operated chatmail relay + notifier service. Prior completed: `plans/share-extension.md` — Sharing Suggestions + Share Extension, code shipped 2026-05-01 (App Group container `group.limo.eth.qxp` + accounts-dir migration; `INSendMessageIntent` donations on send + chat-open + group-delete on logout; `qxpShare/` scaffold with Liquid Glass picker + materialise/send/donate pipeline; multi-target shared `qxp/Core/*`). Awaits Xcode wiring on the Mac to create the `qxpShare` target and toggle the App Group capability — see "Xcode wiring" checklist in the archived plan. Prior: `plans/in-chat-media-browser.md` — In-chat Media / Audio / Files browser, all 5 phases shipped 2026-04-29. Prior: `plans/notifications.md` — Local Notifications + Unread Badges (awaits device verification). Completed plans archive under `plans/`.

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
