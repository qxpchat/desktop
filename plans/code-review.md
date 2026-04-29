# qxp — Code Review

## Project overview

- **Single iOS target** (`qxp`), iOS 26.4 deployment, Swift 6.0 main / 5.0 tests, SwiftUI + UIKit hybrid; one C dependency: `libdeltachat.a` via bridging header.
- **Architecture:** `qxp/Core/` thin Swift wrappers over the Rust core's C FFI + `dc_jsonrpc_*`; `qxp/State/` `@Observable @MainActor` view models (`AppState` is the root), Combine `PassthroughSubject` event bus; `qxp/Navigation/` UITabBarController + UINavigationControllers hosting SwiftUI for everything except the chat list and chat view; `qxp/Views/` SwiftUI screens; `qxp/Chat/` UIKit cells + diffable data sources, with an inverse-transformed UITableView.
- **Hardening surface:** `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, strict concurrency, warnings-as-errors, drain-on-construction C wrappers (`DcLot`, `DcProvider`), `@unchecked Sendable` boxes around opaque pointers, 28 logic + 41 integration tests.
- **Privacy posture:** PrivacyInfo declares only `1C8F.1` (UserDefaults) — no tracking, no third-party SDKs, no APNs. Secrets stay in libdeltachat's SQLite.

## Top 5 immediate fixes

1. **`SUPPORTED_PLATFORMS = "iphoneos iphonesimulator macosx xros xrsimulator"`** (`qxp.xcodeproj/project.pbxproj:398, 450`). Milestone is iOS-only; macosx/xros/xrsimulator are declared but not built or tested. Tighten to `iphoneos iphonesimulator` to prevent stray archive/validation paths. **Severity: High** / Build & tooling.

2. **Test target `SWIFT_VERSION = 5.0`** (`project.pbxproj:480, 504`) while main target is `6.0`. Tests therefore do **not** enforce Swift 6 strict concurrency, isolation, or `Sendable` checking — production-only contracts go untested. Bump tests to 6.0; fix any actor errors that surface. **Severity: High** / Testing & build.

3. **Force-unwraps on weak references in navigation glue.** `MainTabBarController.swift:23` `self.router = appState.router!`; `NavigationRouter.swift:109–110` `.environment(appState!)` / `.environment(appearance!)`. `appState`, `appearance`, and `router` are deliberately weak/optional to avoid retain cycles, so unwrapping at use-time is the wrong half of the contract: a logout/account-switch teardown can null one out and crash navigation. Replace with `guard let` or assertion+fallback. **Severity: High** / Memory management.

4. **Two persistent `Timer.scheduledTimer` loops on the main runloop.** `VoiceMessageCell.swift:156` runs at 20 Hz (0.05 s) for waveform progress; `ChatInputBar.swift:526` at 10 Hz (0.1 s) for recording duration. Both fire UIKit work on every tick and continue while the app is foregrounded. Replace at minimum the playback timer with `CADisplayLink` (or 10 Hz max), and ensure both invalidate on `viewWillDisappear`. **Severity: Medium** / Performance & concurrency.

5. **`UIDevice.current.orientation` in `ChatMediaView.swift:136–137`.** Deprecated since iOS 16 and frequently returns `.unknown` (face-up, face-down, or before motion is enabled). Use `view.window?.windowScene?.interfaceOrientation`, `@Environment(\.horizontalSizeClass)`, or `verticalSizeClass`. The current code computes `isPortrait` from a value that may never settle. **Severity: High** / SwiftUI correctness.

---

## Findings by category

### 1. Memory management & lifecycle

- **High — `MainTabBarController.swift:23`, `NavigationRouter.swift:109–110`:** force-unwraps on weak optionals (see top-5).
- **Medium — `qxpAppDelegate` `static var pendingTap: NotificationTap?`:** correct buffer for cold-launch, but it persists across account switch. Verify it's cleared on logout / account change, otherwise a tap meant for account A can route into account B.
- **Medium — `ChatAttachmentPaneView.rootController()`:** walks `UIApplication.shared.connectedScenes` to find a presenter. Fragile under multi-window / scene background and not future-proof. Prefer threading the presenter through SwiftUI environment.
- **Low — `DcJsonRpc`:** `nonisolated(unsafe) var nextId` + `NSLock` is correct and `Sendable`-clean. `OSAllocatedUnfairLock<UInt64>` would be a slightly cleaner Swift-6-native fit.
- **Low — `EmojiPickerSheet.recents`:** synchronous `UserDefaults.standard.stringArray(forKey:)` in a `@State` initializer. OK for ≤30 emoji, but it's I/O on view init.
- **Nit — Token-UUID async loaders in cells:** consistent `[weak self] + loadID guard` pattern, good hygiene.

### 2. Concurrency & threading

- **High — Test/main Swift version mismatch** (see top-5). With strict concurrency off in tests, regressions in `Sendable` shapes won't be caught by CI.
- **Medium — `BackupExportView` has no timeout.** If `dc_imex(EXPORT_BACKUP)` never emits a progress event (unlikely but possible on storage failure inside the core), `status` stays `.exporting` forever and `interactiveDismissDisabled` never lifts. Add a watchdog (e.g., 30 s no-progress → `.failed`). Also: there is no replay-event protection beyond `guard status == .exporting`, which is a defensible minimum.
- **Medium — `VoiceRecorder` (`@MainActor`)** configures `AVAudioSession.sharedInstance().setCategory/setActive` on the main thread. These calls are documented to be slow and can block the runloop the first time. Hop off-main for setup.
- **Medium — `ProfileDetailsView`** writes `appState.context?.displayName = ...` on **every keystroke** via `.onChange(of: editName)`. Each set goes through the Rust core. Debounce or commit on `submitLabel`/blur.
- **Low — `Task.detached`** for onboarding / imex / receiveBackup is correct, but there's no cancellation propagation: when the user cancels the onboarding sheet, the detached task keeps running. The core's `dc_stop_ongoing_process` is the correct stop signal.
- **Low — `JSONSerialization` for request encoding, `JSONDecoder` for response decoding** in `DcJsonRpc`: the asymmetry is documented and correct (heterogeneous params). No issue.

### 3. Swift idiomatic correctness

- **Medium — `ImageMessageCell.swift:146`:** `let widthCap = hasText ? maxImageBubbleWidth : maxImageBubbleWidth` — both branches identical; either dead ternary or a missing constant for caption-narrowing. Either delete the ternary or fix the intended value (likely a narrower cap when a caption is present).
- **Low — Magic number `> 9` filter** for special-message IDs in `ContactView.swift:408`, `GroupInfoView.swift:341`, `ChatViewModel`. `DC_CHAT_ID_LAST_SPECIAL == 9` in libdeltachat; expose a named constant (e.g. `DcSpecialMessage.lastSpecialId`) and use it everywhere.
- **Low — Duplicated `enum AlertKind`** in `ContactView` and `GroupInfoView`: similar shape, slightly different cases. Acceptable since the message text differs, but extracting a shared `DestructiveConfirm` modifier would dedupe ~120 lines.
- **Low — `DcEnteredLoginParam`** uses `var foo: Type? = nil` everywhere. Idiomatic Swift is `var foo: Type?`.
- **Nit — `LocationPicker.cameraPosition == .automatic`** comparison: `MapCameraPosition` does conform to `Equatable` since iOS 17, so this works, but the equality means "user hasn't moved camera" — fragile signal for "should auto-recenter."

### 4. SwiftUI specifics

- **High — `UIDevice.current.orientation` in `ChatMediaView`** (see top-5).
- **Medium — `ProfileDetailsView` keystroke writes** (see §2).
- **Medium — `EmojiPickerSheet.searchResults`** runs `flatMap → filter → applyingTransform(.toUnicodeName)` on every keystroke against ~1500 emoji. The transform allocates strings; the comment claims "fast enough" — that should be measured, not assumed. Memoize the lowercased name table.
- **Medium — `ProfilesView`** uses an empty `Section { } footer:` to render the version line. Works but is a layout hack. Use `.safeAreaInset(.bottom)` or a footer on the last real section.
- **Medium — `OnboardingProgressOverlay.failureBinding`** writes `appState.resetOnboarding()` from both the alert button and the binding's setter; `resetOnboarding` is idempotent, but the dual call path is easy to break later.
- **Medium — Many literal string interpolations** like `"\(members.count) \(members.count == 1 ? "member" : "members")"` (`GroupInfoView.swift:523, 530`) and `"Mute for 1 hour"` etc. block-localize via String Catalog auto-extraction, but **do not pluralize** — see §12.
- **Low — `searchable + onChange(of: query) { _, _ in refresh() }`** in several pickers (`Compose`, `ContactPicker`, `GroupMemberPicker`) hits the core synchronously on every keystroke. Add a 200–250 ms debounce as `ChatPickerSheet` does.
- **Nit — Inconsistent `Task` patterns:** `.task(id:)` in some views, raw `Task { ... }` in `.onChange` in others. Pick one.

### 5. UIKit specifics

- **High — Massive controllers** (`ChatViewController.swift` 1797 lines, `ChatInputBar.swift` 830, `MessageCell.swift` 740, `ChatListTableViewController.swift` 588). Smell of "MVC-with-everything." Practical splits: ChatHeaderView (owner of title + avatar + glass effects), ChatInputCoordinator (recording, draft, attachments), ChatMessageActionsHandler (long-press menu, forward/share), ChatScrollManager (inverse transform + jump-to-newest).
- **Medium — Inverted UITableView (`scaleY: -1`)** for chat scrollback is clever but breaks default VoiceOver ordering (rotor reads bottom-up visually = top-down logically). Verify `accessibilityElements`, `accessibilityCustomRotors`, and that swipe gestures still feel right with VoiceOver enabled.
- **Medium — `UIHostingConfiguration` in cells:** correct, but every dequeue rebuilds a SwiftUI graph. For long chats with reactions, image cells, etc., profile this — UIKit-only cells may scroll smoother.
- **Low — `CameraPicker`** falls back to `.photoLibrary` when the camera is unavailable. The name promises "camera"; users will be surprised. Either fail closed or rename (`ImageCapturePicker`).
- **Low — `UIImagePickerController`** is the legacy API for camera capture; SwiftUI doesn't have a native still-camera capture API in iOS 26 either, so this stays. Note for future migration to `AVCaptureSession`/`PhotosUI` capture if Apple ships one.

### 6. Architecture & code organization

- **High — `AppState`** owns `accounts`, `context`, `jsonRpc`, `router`, `events`, `badgeCoordinator`, `localNotificationCenter`, `locationStreamingService`, `instantOnboardingViewModel`, `backupTransferViewModel`, plus methods for `addAccount`, `switchAccount`, `removeAccount`, `logout`, `importBackup`, `receiveBackup`, `consumePendingNotificationTap`, `cancelOnboarding`, `cancelAddAccount`, `openChat`. Classic god object. Extract `OnboardingService`, `AccountSwitcher`, `NotificationDispatcher` — `AppState` becomes a router/composition root.
- **Medium — `ChatViewModel`** mixes paging (load older), reactions, drafts, ephemeral timers, photo-message filtering for the gallery, and event subscription. Same split logic.
- **Medium — `Snapshot` types embedded in views** (`ContactView.Snapshot`, `GroupInfoView.Snapshot`) duplicate the read-the-world-on-every-event pattern. Consider lifting these into the ViewModel layer to share between contact view and chat header.
- **Low — Navigation force-unwraps** (see §1).

### 7. Networking

- **N/A in app code** — IMAP/SMTP lives entirely in `libdeltachat.a`. No `URLSession`, no third-party HTTP. **Plus.**
- **Low — `LocalNetworkPrompt.trigger()`** opens a UDP socket purely to surface the local-network permission dialog. Idiomatic for the use case (multidevice transfer over Bonjour); confirm the socket is closed deterministically (FD leak check).

### 8. Persistence & data

- **Medium — Photo library access** in `ChatAttachmentPaneView` doesn't observe `PHPhotoLibraryChangeObserver`. The "recent 96" set goes stale after the user takes a photo from the camera while the pane is open — dismissal/redisplay is required to refresh.
- **Medium — Backup export temp dir** (`BackupExportView.swift:120`) writes under `FileManager.default.temporaryDirectory.appendingPathComponent("backup-\(UUID())")`. iOS may purge under memory pressure during a long export. Use `.itemReplacementDirectory` or a purposed app group dir.
- **Low — `EmojiPickerSheet` recents** in `UserDefaults.standard`: capped at 30 entries, fine.
- **Low — `libdeltachat`** uses sqlcipher for the on-disk DB; verify the static lib was built with sqlcipher enabled (header check `dc_get_info` includes `sqlcipher_version`).

### 9. Performance

- **High — `DcContext.getChatMedia`** does `Array(...reversed())` (double-allocation; full second copy). Use `.reversed()` (the lazy `ReversedCollection` view) or build with `result.reserveCapacity(count)` and append in reverse during the FFI loop.
- **Medium — `getAllMediaCountString`** issues 3 FFI calls (image, audio, file). Either expose a single `dc_get_chat_media_count` aggregate in the core, or cache the result keyed by `chatId + lastModifiedSeq` in the view model.
- **Medium — `EmojiPickerSheet.searchResults`** (see §4).
- **Medium — Two main-thread timers** (see top-5).
- **Medium — `ContactView.Snapshot.load`** invokes `getLocations(...).filter{}.max(by:)` on every refresh; for an active live-location chat with thousands of points this is O(n) on the main thread. Cap the time window or paginate at the FFI layer.
- **Low — `ChatViewModel.photoMessages`** is a computed property over the whole message set — recomputed per access. Memoize against the message-changed token.
- **Low — `OSLogStore` log dump** walks all entries from boot+1s, then `.compactMap.filter.map.joined`. After several hours of runtime the export can stall the UI thread for seconds. The work is on a `Task.detached`, but consider capping at, say, last 10k entries.

### 10. Security & privacy

- **Medium — `Logger.swift` uses `privacy:.public` everywhere** (5 occurrences). Email addresses, peer fingerprints, message ids should use `.private` (or `.sensitive` where applicable). Public is the correct default for **redaction** under release, but unintentionally tags PII as freely shareable.
- **Medium — `LogView` exports `dc_get_info`** which includes paths, addresses, and version strings. The header warns the user explicitly — good — but also include a "redact addresses" toggle for sharing.
- **Low — `UIPasteboard.general.string`** is read in `ScanQrView` (paste-code fallback) and written in `QrShowView`/`GroupQrInviteView`. iOS 16+ shows the system permission UI on read, so that's covered. **Plus.**
- **Low — `interactiveDismissDisabled`** during `BackupTransferView` transferring state — prevents accidental abort. **Plus.**
- **Low — `PrivacyInfo.xcprivacy`** is minimal and accurate. **Plus.**
- **Low — `UIApplication.shared.isIdleTimerDisabled`** is correctly toggled in onAppear/onDisappear pairs in `BackupTransferView` and `ScanQrView` (when receiving backup). **Plus.**

### 11. Accessibility

- **Medium — Inverse-transformed chat table:** without explicit `accessibilityElements` / custom rotor, VoiceOver order is bottom-up (newest first) which feels backwards. Worth a focused pass.
- **Medium — Custom `UIControl` chat title view, scroll-down button, reaction chips:** verify each has `accessibilityLabel`, `accessibilityHint`, and meaningful `accessibilityTraits` (button vs static). Spot-check showed `EmojiPickerSheet` does this well; chat cells less clearly.
- **Medium — Voice memo recording UI** lacks state-change announcements. A blind user can't tell when recording started/stopped without timer haptics.
- **Low — Dynamic Type:** `.font(.system(.footnote, design: .monospaced))` etc. scale correctly. **Plus.**
- **Low — Reduce Transparency / Increase Contrast:** the Liquid Glass surfaces should already adapt, but verify the bubble colors stay readable when a strong `chatColor` tint is selected.

### 12. Localization

- **High — `Localizable.xcstrings` is English-only** with many keys' `localizations` blocks empty (placeholders only). Acknowledge this in the README/onboarding or remove the catalog scaffolding until translations land.
- **Medium — No plurals.** `"\(members.count) \(members.count == 1 ? "member" : "members")"` (`GroupInfoView.swift:523, 530`) and similar in `ContactView`, `BlockedContactsView`. Languages with non-English plural rules will read awkwardly. Use a stringsdict / String Catalog plural variation.
- **Medium — Mixed key conventions:** snake_case keys imported from deltachat-core (`"multidevice_title"`, `"qrshow_join_contact_hint"`, `"withdraw_qr_code"`) sit next to natural-English keys (`"Mute for 1 hour"`). Pick one approach for new strings — natural-English is friendlier to translators.
- **Low — Date/time formatting** uses `RelativeDateTimeFormatter` and locale-aware `.formatted(.percent...)` — locale-correct. **Plus.**
- **Low — `LocalizedStringKey`** is correctly used for `Text(...)` with interpolation. Embedded markdown (`AboutView`) renders correctly via SwiftUI's automatic Markdown parsing on `Text`.

### 13. Testing

- **High — Test target Swift 5.0** (see top-5).
- **Medium — No SwiftUI surface tests.** With `ChatViewController` UIKit-bridged to SwiftUI hosting controllers and `AppState` driving everything, you have integration coverage at the model layer but nothing exercising actual view bindings. ViewInspector or `XCTest` snapshot tests on key flows (login, send message, reaction, switch account) would be valuable.
- **Medium — Coverage gaps in `ChatViewModel`:** no tests for reaction toggling, draft round-trip after app relaunch, ephemeral timer apply-on-send, and the photo-message gallery filtering (the `> 9` system-id filter).
- **Low — `TestHelper.setUp`** sets `bcc_self=false`, `configured=true` — bypasses real configuration. Document why (so future contributors don't replace the simulated config with real network).
- **Low — `testLargeChatPaginates`** uses 60 messages; pagination boundary in `ChatViewModel` is likely larger. Push to e.g. 500 to actually exercise paging.

### 14. Build & tooling

- **High — `SUPPORTED_PLATFORMS`** (see top-5).
- **High — Swift version mismatch** (see top-5).
- **Medium — `libdeltachat.a` slices:** with iOS 26 simulator only available on Apple silicon, ensure the static lib ships arm64 device + arm64 simulator slices (and drop x86_64 sim). XCFramework would be cleaner than `.a`+headers.
- **Medium — `scripts/generate-logo.py`, `scripts/render-icons.sh`** referenced from `BrandHeader.swift`. CI should regenerate to detect drift; otherwise the SVG and the Swift-generated path can diverge silently.
- **Low — No SwiftLint / SwiftFormat config visible.** With strict concurrency on, lint adds little, but a SwiftFormat config locks in the consistent style already present.
- **Low — Bundle id** `limo.eth.qxp` — fine.

### 15. Error handling & logging

- **Medium — `try?` swallows widely.** `try? ctx.setSelfAvatar(jpegData: data)` (`ProfileDetailsView.swift:113`), `try? await item.loadTransferable(...)` in several photo pickers, `try? FileManager.default.createDirectory(...)`. The user gets no feedback when avatar save / file write fails. At minimum log via `DcLogger`; preferably surface a toast.
- **Medium — `DcJsonRpc.call/callVoid`** returns `nil`/`false` on transport, encoding, decoding **and** protocol-error paths uniformly. Callers can't tell apart "method does not exist" from "connection dropped." Log the discriminant via `DcLogger`.
- **Medium — `ConnectivityView` parses HTML with five `try!` regexes** (`ConnectivityView.swift:323–335`). The literals are fixed so `try!` won't crash, but the broader parser is brittle to upstream HTML changes — acknowledged in the file comment. Add a fallback to plain-text rendering when parsing comes up empty rather than showing a blank list.
- **Medium — `BackupExportView` has no timeout** (see §2).
- **Low — `LocatorService.didFailWithError`** is empty — silently swallows location errors. Log them at least.

---

## Prioritized action list

**P0 — this week**
1. Tighten `SUPPORTED_PLATFORMS` to `iphoneos iphonesimulator`.
2. Move tests to `SWIFT_VERSION = 6.0`; fix any concurrency errors that surface.
3. Replace the three force-unwraps on weak optionals (`MainTabBarController:23`, `NavigationRouter:109–110`).
4. Replace `UIDevice.current.orientation` in `ChatMediaView` with `windowScene.interfaceOrientation` or size classes.
5. Resolve the `widthCap` redundant ternary in `ImageMessageCell:146`.
6. Add a no-progress watchdog (`BackupExportView`) and propagate cancel via `dc_stop_ongoing_process` from onboarding.

**P1 — this month**
7. Split `ChatViewController`, `ChatInputBar`, `ChatViewModel`, `MessageCell` along the seams identified.
8. Replace `Timer.scheduledTimer(0.05)` in `VoiceMessageCell` with `CADisplayLink` (or 10 Hz cap).
9. Memoize `ChatViewModel.photoMessages`, `getAllMediaCountString`, and `EmojiPickerSheet` search-name table.
10. Replace `Array(...reversed())` in `DcContext.getChatMedia` with the lazy `ReversedCollection` or build in reverse.
11. Add stringsdict plural variations for member / recipient counts.
12. Add tests: reaction toggling, draft round-trip, ephemeral timer, large pagination (≥500).

**P2 — when time allows**
13. Refactor `AppState` into a router + focused services (Onboarding, AccountSwitcher, NotificationDispatcher).
14. Privacy-logging audit: replace `privacy:.public` with `.private` for PII fields.
15. Accessibility audit on the inverse-transformed chat table and custom `UIControl`s.
16. Localization completion + plural rules pass.
17. Replace `libdeltachat.a` with an `.xcframework`.
18. Add SwiftFormat config and CI run.

---

## What's done well (brief)

- **C-FFI memory safety:** drain-on-construction wrappers (`DcLot`, `DcProvider`), `nonisolated(unsafe) let handle: OpaquePointer`, deinit-unref pattern. This eliminates a whole bug class.
- **Privacy posture:** zero third-party SDKs, minimal PrivacyInfo, no APNs/silent push, no analytics. Genuinely clean.
- **Strict concurrency on main target:** `MainActor` default + explicit `nonisolated`/`@unchecked Sendable` only where pointer ownership demands it — disciplined.
- **Diffable data sources** with explicit no-animation initial loads — modern, smooth.
- **iOS 26 native materials only:** `.glassEffect`, `buttonStyle(.glass)`, `UIGlassContainerEffect` — no custom blur shims, matches the milestone direction.
- **Token-UUID async loading pattern** in chat cells prevents stale-image swap bugs.
- **Reaction lookup via host callback** instead of per-message JSON-RPC — performance-aware design choice that's easy to get wrong.
- **Test isolation:** UUID-temp-dir per test, fresh DC account, clean teardown.
