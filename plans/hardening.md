# PLAN: Refactoring & Test Strategy

## Context

qxp's MVP is feature-complete (2026-04-13). Since the original code review (2d0deff), 10 commits landed: groups & channels, search, connectivity/relay management, compose flow, QR dispatch, about view, and numerous UX improvements. This extended plan incorporates findings from the original review plus new findings from the post-MVP code.

**Scope:** Refactor existing code for production quality; add automated tests. **Not in scope:** new features, UI redesign, macOS support.

---

## Code Review Findings

### P1 — Performance: All Messages Loaded at Once (CRITICAL)

`ChatViewModel.load()` calls `context.getChatMsgs(chatId:)` which returns **every message ID in the chat**, then iterates all of them building `MessageItem` structs. Each requires multiple FFI calls (getMessage, getContact, getMessageReactions via JSON-RPC, quotedMessage, vCard file read). For a chat with 10k+ messages this is O(n) FFI calls on the main actor.

**Fix:** Implement windowed/paged loading — load only the last N messages initially, load older messages on scroll-to-top.

### P2 — Performance: Chatlist Rebuilds on Every Event

`ChatListViewModel.onEvent` calls `refresh()` on 11 different event types. `refresh()` fetches two chatlists (normal + archived count), then iterates every chat calling `getChat`, `getSummary`, `getFreshMsgCount` per row. No debouncing — rapid incoming message events cause N full rebuilds.

**Fix:** Debounce chatlist refresh (100-200ms coalesce window). Cache `archivedCount`.

### P3 — Performance: ChatViewModel Reloads Everything on Any Event

`ChatViewModel.onEvent` calls `load()` (full message reload) for events like `msgRead`, `msgDelivered`, `reactionsChanged`. These events only affect a single message — the entire array is rebuilt.

**Fix:** For single-message events, update only the affected `MessageItem` in-place rather than rebuilding the whole array.

### P4 — Performance: Search Fires Three Queries Per Keystroke (NEW)

`ChatListViewModel.searchText` setter calls `updateSearch()` synchronously on every character. This fires `getChatlist(query:)` + `getContacts(query:)` + `searchMessages(query:)` — three core queries per keystroke, plus hydrating up to 200 message results (each requiring `getMessage` + `getChat` FFI calls).

**Fix:** Debounce search (200-300ms), same pattern as `scheduleDraftPersist`.

### P5 — Performance: NSDataDetector Created Per Bubble Render (NEW)

`MessageBubble.attributedText(linkColor:)` (`MessageBubble.swift:479`) creates a new `NSDataDetector` every time it's called. This runs for every visible bubble during scrolling.

**Fix:** Make it a `static let`.

### P6 — Performance: LocationSnapshotCache Grows Unbounded (NEW)

`LocationSnapshotCache` (`LocationBubble.swift:139`) has no eviction policy. Each unique coordinate + pixel size stays in memory forever.

**Fix:** Add an LRU cap (e.g., 50 entries).

### P7 — Duplication: `rgbColor` Helper Duplicated

`MessageBubble.rgbColor(_:)` and `MessageInputBar.rgbColor(_:)` are identical. `AvatarView.avatarColor` also has the same conversion inline.

**Fix:** Extract a single `Color.init(rgb: UInt32)` extension.

### P8 — Duplication: `preview(from:)` in ChatListViewModel and ArchivedChatsView

Both `ChatListViewModel.preview(from:)` and `ArchivedChatsView.preview(from:)` are identical implementations.

**Fix:** Move to `ChatSummary` as a computed property.

### P9 — Duplication: Chatlist-to-Items Conversion

`ArchivedChatsView.refresh()` duplicates the chatlist→`[ChatListItem]` loop from `ChatListViewModel.refresh()` almost line-for-line. Also the search results builder in `updateSearch()` has a third copy.

**Fix:** Extract a shared `buildChatListItems(from:context:)` helper, or let `ArchivedChatsView` use a `ChatListViewModel` configured with archived-only flags.

### P10 — Duplication: Bubble Shape Construction

Every specialized bubble (`FileBubble`, `VoiceBubble`, `ContactBubble`, `LocationBubble`) independently constructs the same outgoing/incoming `UnevenRoundedRectangle` with the same radii.

**Fix:** Extract `BubbleShape.outgoing` / `.incoming` static properties.

### P11 — Duplication: Glass Effect + Shape Application Pattern

Every bubble applies `.glassEffect(message.isOutgoing ? .regular.tint(chatColor) : .regular, in: shape)`. This 3-line pattern repeats 8+ times.

**Fix:** A `.bubbleGlass(isOutgoing:shape:)` view modifier.

### P12 — Duplication: `stateGlyph` Duplicated (NEW)

`ChatListRow.stateGlyph` and `MessageFooter.stateGlyph` have identical switch statements mapping `DcMessageState` to SF Symbol names.

**Fix:** Add a `DcMessageState.glyph: String?` computed property.

### P13 — Duplication: `saveImageToBlob` Pattern (NEW)

`NewGroupView.saveImageToBlob(_:context:)`, `ContactView.saveGroupAvatar(_:)`, and `DcContext.setSelfAvatar(jpegData:)` all do the same jpeg→blobdir→write→return-path pattern.

**Fix:** Extract a `DcContext.saveImageToBlob(_:) -> String?` method.

### P14 — Duplication: Contact Row Layout (NEW)

`ComposeView.contactRow(for:)`, `GroupMemberPicker.contactRow(for:selected:)`, and `GroupMemberPicker.selfRow(for:)` all render the same avatar+name+email layout independently.

**Fix:** Extract a shared `ContactRowView`.

### P15 — Duplication: Ephemeral Duration Text (NEW)

`ContactView.EphemeralOption.title(forSeconds:)` and `ChatView.ephemeralDurationText(seconds:)` both map seconds→human-readable-string with slightly different formats.

**Fix:** Unify into a single source in `EphemeralOption`.

### P16 — Duplication: dc_array→[UInt32] Pattern

`DcContext` has 6+ methods (`getChatMsgs`, `getContacts`, `importVcard`, `getBlockedContacts`, `getChatContacts`, `searchMessages`) and `DcAccounts.getAll()` that all do the same `dc_array → [UInt32]` loop with `reserveCapacity`.

**Fix:** Extract `dcArrayToIds(_ array: OpaquePointer?) -> [UInt32]` utility.

### P17 — Non-Idiomatic: 17+ Manual `Binding(get:set:)` Wrappers (WORSENED)

Throughout views (`ScanQrView` ×3, `ChatView` ×3, `ContactView`, `ChatListView`, `ProfilesView`, `ConnectivityView` ×2, `BlockedContactsView`, `QrDispatch`, `InstantOnboardingView`, `OnboardingProgressOverlay` ×2) there are manual `Binding(get: { x != nil }, set: { if !$0 { x = nil } })` constructions for presenting sheets/alerts from optionals. The count has grown from 6 to 17+ since the original review.

**Fix:** Add a `Binding<T?>.isPresent() -> Binding<Bool>` extension.

### P18 — Non-Idiomatic: `_ = afterSend` Dead Code

`ChatViewModel.cleanupTempFile(for:afterSend:)` line 609: `_ = afterSend` — the parameter is accepted but never used.

**Fix:** Remove the `afterSend` parameter entirely.

### P19 — Non-Idiomatic: `VoicePlayback` Uses `ObservableObject` (NEW)

All other state types use `@Observable`. `VoicePlayback` uses `ObservableObject` + `@Published`. Mixes two observation frameworks.

**Fix:** Migrate to `@Observable`.

### P20 — Non-Idiomatic: ComposeView Calls FFI Per Row in View Body (NEW)

`ComposeView`'s `ForEach` calls `appState.context?.getContact(id: id)` inside the view body for every row on every re-render. Same with `GroupMemberPicker`.

**Fix:** Pre-hydrate contacts into a display struct (like `SearchContactItem`).

### P21 — Dead Code

- `DcContext.sendTextMessage(chatId:text:)` (`DcContext.swift:288`) — never called; `sendMessage(chatId:msg:)` is used everywhere.
- `DcChatlist.getMsgId(at:)` (`DcChatlist.swift:39`) — never called.
- ~~`DcContext.setChatName`~~ — now used by `ContactView`. No longer dead.
- ~~`DcContext.addContactToChat`~~ — now used by `NewGroupView`, `NewChannelView`, `ContactView`. No longer dead.
- `DcTransportParam.password` — field never read, but required for `Decodable`. Keep; document.

### P22 — VoicePlayback Timer Polling

`VoicePlayback.play()` uses `Timer.scheduledTimer(withTimeInterval: 0.05)` (20 Hz) polling to check `AVAudioPlayer.isPlaying` and report progress.

**Fix:** Use `AVAudioPlayerDelegate.audioPlayerDidFinishPlaying` for completion, and `TimelineView` for progress.

### P23 — Hardcoded 3-Second Splash

`RootView` holds a hard `Task.sleep(for: .seconds(3))` splash. This delays app readiness even when `initialize()` completes instantly.

**Fix:** Race the sleep against `appState.isReady` — dismiss whichever finishes first, with a minimum of ~0.5s.

### P24 — No `Sendable` Conformances on Value Types

`MessageItem`, `ChatListItem`, `ChatSummary`, `DraftAttachment`, `ReactionChip`, `ReactorEntry`, `SearchContactItem`, `SearchMessageItem`, `ChatMessageDestination`, `RelayInfo`, `ConnectivityLine`, `QuotaInfo` are all value types used across concurrency boundaries but don't declare `Sendable`.

### P25 — ConnectivityView HTML Parsing Uses `try!`

`parseConnectivityHtml` and `parseIncomingTransports` use `try!` for regex construction. Move to `static let` compiled-once patterns.

### P26 — DcJsonRpc Uses JSONSerialization for Requests, Codable for Responses

Low priority — the `params: [Any]` flexibility is intentional for heterogeneous argument lists. Document the asymmetry.

### P27 — DcContext Borrowing Semantics Are Error-Prone

Low priority. `DcContext.init(borrowing:)` takes a pointer it does NOT own — no compile-time enforcement. Document clearly.

---

## Phase 1: Test Suite — Build the Safety Net ✅ DONE (2026-04-17)

**Goal:** Automated test coverage for current behavior BEFORE any refactoring. Every subsequent phase runs green against these tests.

**Outcome:** 69 tests passing (28 pure logic + 41 integration). No IO, no network, no sleeps — all tests run fast against a temp SQLite per test case.

- `qxpTests/TestHelper.swift` — `DcTestCase` base class: temp `DcAccounts`/`DcContext` per test, mirrors deltachat-ios `DcTestContext.newOfflineAccount()` pattern (config flags + explicit self-chat creation).
- `qxpTests/PureLogicTests.swift` — 28 unit tests: `parseVCardFields` (6), `mimeForURL` (3), `fileGlyph` (8), `RelativeChatTimestampFormatter` (3), `ConnectivityView.parseConnectivityHtml` (4), `ChatSummary` preview (4).
- `qxpTests/IntegrationTests.swift` — 41 integration tests: DcContext (14), DcAccounts (3), ChatListViewModel (4), ChatViewModel (4), QrDispatch (4), GroupCreation (2), Drafts (2), EphemeralTimer (2), plus config/contact/chat lifecycle tests.
- `AppState.init(accounts:)` added for test injection.
- `qxpTests.xctestplan` + scheme updated for explicit test plan.
- **Limitation:** `addContactToChat`, `getContacts`, and group membership operations require encryption keys generated by `dc_configure()` (needs real server). These are covered by on-device QA, not offline tests. The reference deltachat-ios tests also skip these offline.

#### Strategy

Two test layers:

1. **View models + integration (`qxpTests`)** — `@Observable @MainActor` classes tested with a real `DcContext` backed by a temp account directory (no network needed — the core supports local-only operation). This tests business logic: event handling, draft management, message loading, account switching, search, groups, channels.

2. **Pure logic helpers** — vCard parsing, emoji detection, formatters, HTML parsing, MIME lookup. Plain unit tests, no core dependency.

E2E / XCUITest deferred — the integration tests above cover the FFI boundary thoroughly. UI tests are added when the UI stabilizes post-refactor.

#### Steps

1. Create `qxpTests` target linked against `libdeltachat.xcframework`.
2. Add a `TestHelper` that creates a temp `DcAccounts`/`DcContext` per test case and tears it down after.
3. Implement **pure logic unit tests** (no core needed):
   - `parseVCardFields`: extracts FN and EMAIL from standard vCard text
   - `parseVCardFields`: handles folded lines, missing fields, empty input
   - `mimeForURL`: known extensions → correct MIME, unknown → octet-stream
   - `fileGlyph`: known extensions → correct SF Symbol
   - `RelativeChatTimestampFormatter`: today → time, < 7 days → weekday, older → date
   - `ConnectivityView.parseConnectivityHtml`: parses sample HTML correctly, handles empty/malformed input
   - `Character.isEmoji`: true for emoji (single, ZWJ, skin-tone), false for letters/digits
   - `EphemeralOption.title(forSeconds:)`: correct labels for known durations
   - `DateHeaderView.format`: today → "Today", yesterday → "Yesterday", recent → weekday, old → date
   - `MessageFooter.formatTimestamp`: now → "Now", recent → relative, older → time string
   - `QrDispatch.analyze`: each `DcQrState` maps to correct `Action` variant
   - `ChatSummary.preview`: text1+text2 join, empty text1, empty text2
4. Implement **view model tests** (integration, temp account DB):
   - `ChatListViewModel`: bind, refresh produces items matching core state
   - `ChatListViewModel`: event-driven refresh (simulate msgsChanged)
   - `ChatListViewModel`: search populates searchChats/searchContacts/searchMessages
   - `ChatListViewModel`: togglePin, archiveChat, deleteChat, toggleMute, markRead
   - `ChatViewModel`: load populates messages from core
   - `ChatViewModel`: send clears draft and triggers core send
   - `ChatViewModel`: draft persistence (text, attachment staging/clearing)
   - `ChatViewModel`: replyTo/cancelReply state management
   - `ChatViewModel`: startEditingMessage/cancelEditing/sendEdit flow
   - `ChatViewModel`: deleteMessage, deleteMessageForEveryone, canDeleteForEveryone logic
   - `ChatViewModel`: copyMessageText puts text on pasteboard
   - `ChatViewModel`: forwardMessage delegates to context
   - `ChatViewModel`: toggleReaction calls JSON-RPC
   - `AppState`: initialize creates account, sets isReady
   - `AppState`: login sets isConfiguring, configProgress events drive state
   - `AppState`: logout removes account, creates fresh scratch
   - `AppState`: switchAccount updates context and isLoggedIn
   - `AppState`: addAccount/cancelAddAccount lifecycle
   - `AppState`: removeAccount with fallback behavior
   - `AppState`: handleScenePhase starts/stops IO
   - `AppState`: openChat sets pendingChatId and selectedTab
   - `AppState`: createInstantAccount drives onboardingPhase
   - `AppState`: importBackup/receiveBackup lifecycle
   - `AppState`: cancelOnboarding/resetOnboarding state management
   - `AppState`: allAccounts returns correct AccountInfo list
   - `AppearanceSettings`: load/save round-trip for theme, color, wallpaper
   - `AppearanceSettings.removeAll`: cleans up all keys for an account
   - `InstantOnboardingViewModel`: isCreateEnabled requires non-empty name
   - `InstantOnboardingViewModel`: providerHost extraction from QR codes
   - `InstantOnboardingViewModel`: applyScanned accepts login/account, rejects others
   - `DcJsonRpc`: listTransports returns decoded transport list
   - `DcJsonRpc`: addOrUpdateTransport encodes and sends correctly
   - Group creation: `createGroupChat` + `addContactToChat` + verify members
   - Channel creation: `createBroadcast` + `addContactToChat` via JSON-RPC
5. All tests green. This is the baseline for all subsequent phases.

### Phase 2: Performance — Windowed Message Loading ✅ DONE (2026-04-17)

**Goal:** Reduce per-event work in chat view. Tests from Phase 1 must stay green.

**Outcome:** 71 tests passing. Initial `onAppear` sentinel approach broken (can't re-trigger after prepending items). Fixed with `onScrollGeometryChange` — loads more when the user scrolls into the upper half of the content. Extracted `hydrateMessage()`/`hydrateMessages()` from the monolithic `load()` loop. Single-message events (`msgDelivered`, `msgRead`, `msgFailed`, `reactionsChanged`) now call `updateMessage()` in-place instead of full reload. New tests: `testSmallChatLoadsAll`, `testLargeChatWindows`.

### Phase 3: Performance — Debouncing & Caching ✅ DONE (2026-04-17)

**Goal:** Prevent chatlist and search from hammering the core on rapid-fire events. Tests green.

**Outcome:** 71 tests passing. Chatlist refresh debounced (150ms coalesce via Task-cancel pattern). Search debounced (250ms); empty search clears instantly. `NSDataDetector` in `MessageBubble.attributedText()` promoted to `static let`. `LocationSnapshotCache` capped at 50 entries with LRU eviction.

### Phase 4: Deduplication ✅ DONE (2026-04-17)

**Goal:** Eliminate copy-paste code across the codebase. Tests green.

**Outcome:** 9 of 11 items completed. Shared utilities in `SharedExtensions.swift`: Color(rgb:), BubbleShape, DcMessageState.glyph, Binding.isPresent, EphemeralOption. Core-level: `dcArrayToIds()` in DcContext.swift, `saveImageToBlob()` on DcContext, `ChatSummary.preview`, `ChatListItem.items(from:context:)`. Two items deferred: `.bubbleGlass()` modifier (iOS 26 `.glassEffect` API incompatible with ViewModifier — type inference fails on the ternary `GlassEffect` expression inside `body`); ContactRowView (item 10, implementations differ enough that abstraction adds complexity).

**Steps:**
1. ✅ **`Color(rgb:)` extension** — replaced `rgbColor(_:)` in MessageBubble, MessageInputBar, ReactionDetailSheet, AvatarView.
2. ✅ **`ChatSummary.preview` computed property** — replaced duplicate `preview(from:)` in ChatListViewModel and ArchivedChatsView. Tests updated to call `.preview` directly.
3. ✅ **`dcArrayToIds(_:)` utility** — replaced 7 instances across DcContext (6) and DcAccounts (1).
4. ✅ **Shared bubble shape** — extracted `BubbleShape.outgoing`/`.incoming`/`.shape(isOutgoing:)`, used by all 5 bubble views.
5. ⏭️ **`.bubbleGlass()` modifier** — dropped. iOS 26 `.glassEffect` API doesn't work inside a `ViewModifier.body` — type inference fails on the ternary `GlassEffect` expression. Not worth a workaround for a 1-line call.
6. ✅ **`ArchivedChatsView`** — extracted `ChatListItem.items(from:context:)` static method. Used by ChatListViewModel.refresh(), ArchivedChatsView.refresh(), and search.
7. ✅ **`Binding.isPresent()`** — replaced 16 manual optional→Bool binding wrappers (ChatView ×3, ScanQrView ×3, ConnectivityView ×2, ContactView, ChatListView, ProfilesView, InstantOnboardingView, AppearanceView, AutoDeletePickerView, BlockedContactsView, QrDispatch). Removed 4 computed-property wrappers.
8. ✅ **`DcMessageState.glyph`** — replaced duplicate `stateGlyph` in ChatListRow and MessageFooter.
9. ✅ **`DcContext.saveImageToBlob(_:prefix:)`** — replaced duplicate jpeg→blobdir→write in NewGroupView and ContactView.
10. ⏭️ **Shared `ContactRowView`** — deferred. ComposeView (name-only, .medium weight), GroupMemberPicker (name+email+checkmark), and selfRow (dimmed, always checked) differ enough that a shared view adds parameter complexity without meaningful gain.
11. ✅ **Unified `EphemeralOption`** — moved to SharedExtensions. ChatView now calls `EphemeralOption.title(forSeconds:)`. Removed duplicate `ephemeralDurationText`.

### Phase 5: Code Quality & Idiomaticness ✅ DONE (2026-04-17)

**Goal:** Remove dead code, fix non-idiomatic patterns. Tests green.

**Outcome:** All 8 steps completed. Removed dead code (`afterSend`, `sendTextMessage`; `getMsgId` was already gone). Added `Sendable` to 12 value types. Migrated `VoicePlayback` to `@Observable` with `AVAudioPlayerDelegate` for completion. Splash now races 0.5s minimum against `isReady`. `ComposeView` and `GroupMemberPicker` pre-hydrate contacts into `SearchContactItem` structs.

**Steps:**
1. ✅ **Dead code removal:** removed `afterSend` from `cleanupTempFile`, removed `sendTextMessage`. `getMsgId` was already gone.
2. ✅ **Sendable:** added to `MessageItem`, `ChatListItem`, `ChatSummary`, `DraftAttachment`, `ReactionChip`, `ReactorEntry`, `SearchContactItem`, `SearchMessageItem`, `ChatMessageDestination`, `DcLot`, `RelayInfo`, `ConnectivityLine`, `QuotaInfo`.
3. ✅ **VoicePlayback:** migrated from `ObservableObject`/`@Published` to `@Observable`. Replaced `.onReceive` with `.onChange`. Removed Combine import.
4. ✅ **AVAudioPlayerDelegate:** VoicePlayback now subclasses `NSObject`, conforms to `AVAudioPlayerDelegate`. Completion via `audioPlayerDidFinishPlaying` instead of polling `isPlaying`. Timer still runs for progress updates.
5. ✅ **Splash:** changed from 3s hard sleep to 0.5s minimum. View already checks `appState.isReady`, so it dismisses as soon as both conditions are met.
6. ✅ **Pre-hydrate contacts:** `ComposeView` and `GroupMemberPicker` now hydrate contacts into `SearchContactItem` structs during `refresh()` instead of calling `getContact()` FFI per row in the view body.
7. ✅ **Document HTML parsing:** added fragility note to `parseConnectivityHtml`.
8. ✅ **Document JSON-RPC asymmetry:** added note to `DcJsonRpc.swift` file header.

### Phase 6: Hardening ✅ DONE (2026-04-17)

**Goal:** Lock down compiler discipline and runtime safety. Tests green.

**Outcome:** All 7 steps complete. `SWIFT_STRICT_CONCURRENCY=complete` and `SWIFT_TREAT_WARNINGS_AS_ERRORS=YES` enabled — zero warnings. TSan and ASan pass clean. All 5 HTML-parsing regexes promoted to static lets (zero `try?` NSRegularExpression in codebase). All ~40 `try?` usages audited and documented where intentionally swallowed.

**Steps:**
1. ✅ **Strict concurrency** — `SWIFT_STRICT_CONCURRENCY=complete` enabled. Zero warnings.
2. ✅ **Warnings as errors** — `SWIFT_TREAT_WARNINGS_AS_ERRORS=YES` enabled.
3. ✅ **Thread Sanitizer (TSan)** — all tests pass under TSan.
4. ✅ **Address Sanitizer (ASan)** — all tests pass under ASan.
5. ✅ **Access control audit** — existing access control is adequate. View helpers and view-model methods are already `private` where appropriate.
6. ✅ **Fix `try!` in ConnectivityView HTML parser** — all 5 regex patterns promoted to `private nonisolated static let` (h3Regex, transportRegex, boldRegex, percentRegex, liRegex). Zero `try?` NSRegularExpression remaining in the codebase.
7. ✅ **Silent error audit** — evaluated all ~40 `try?` usages. Categories:
   - **Task.sleep** (7 usages) — debounce/delay; `CancellationError` is the expected "failure." Standard pattern, no comments.
   - **JSON-RPC** (6 usages in DcJsonRpc.swift) — methods return nil/false on failure; callers handle it. Asymmetry documented in file header.
   - **FileManager.createDirectory** (3) — best-effort; directory likely exists. Commented.
   - **FileManager.removeItem** (5) — best-effort cleanup; file may not exist. Commented.
   - **AVAudioSession.setActive** (3) — best-effort deactivation. Commented.
   - **Attachment staging writes** (4 in ChatView) — staging to tmp; failure causes send to fail at core level. Commented.
   - **Wallpaper save/delete** (4 in AppearanceSettings) — best-effort; reverts to default on failure. Commented.
   - **Guarded/checked `try?`** (~13 usages) — result feeds into `guard`/`if-let`/`?? default`. Not swallowed.
   - **Other** (ScanQrView startScanning, InstantOnboarding setSelfAvatar) — best-effort, non-critical. Commented.

---

## Open Questions / Deferred

- **Push notifications:** Will require background processing changes; Phase 2's windowed loading helps.
- **E2E/XCUITest:** Deferred until after refactoring stabilizes the UI layer. Phase 1 covers business logic via integration tests.
- **Message search pagination:** Not in MVP scope but will need the windowed loading from Phase 2 as a foundation.
- **Media viewer pagination:** `ChatViewModel.photoMessages` filters ALL messages. With windowed loading, this needs to be rethought.
