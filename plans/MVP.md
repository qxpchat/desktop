# qxp MVP Implementation Plan

## Context

Build a minimalist Delta Chat iOS client (iOS 18+, SwiftUI) with Signal-like design. MVP scope: login with email+password, chat list, chat view, send/receive text. Must coexist with other DC clients on the same account.

Single dependency: `libdeltachat.a` (compiled Rust core). Zero Swift/ObjC package manager dependencies.

---

## Phase 0: Core Library Build — ✅ DONE (2026-04-13)

**Goal:** Get `libdeltachat.a` + `deltachat.h` compiled and linked into the Xcode project.

**Outcome:** `libs/libdeltachat.xcframework` built (ios-arm64 + ios-arm64-simulator slices, headers bundled); `scripts/build-core.sh` automates the pipeline; `qxp/Bridge/qxp-Bridging-Header.h` wired into the Xcode project; SystemConfiguration + Security frameworks linked. Submodule pinned at v2.49.0.

### Steps

1. **Clone deltachat-core-rust** as a git submodule, pinned to the latest stable release tag:
   ```
   git submodule add https://github.com/deltachat/deltachat-core-rust.git libs/deltachat-core-rust
   cd libs/deltachat-core-rust && git checkout v2.49.0 && cd ../..
   git add libs/deltachat-core-rust
   ```
   Current pin: **v2.49.0** (commit `dab7ca1`). Bump this tag when a newer stable release ships.

2. **Install Rust iOS targets:**
   ```
   rustup target add aarch64-apple-ios aarch64-apple-ios-sim
   ```

3. **Build for device + simulator** (from `libs/deltachat-core-rust/deltachat-ffi/`):
   ```
   cargo build --target aarch64-apple-ios --release
   cargo build --target aarch64-apple-ios-sim --release
   ```
   Output: `target/aarch64-apple-ios/release/libdeltachat.a` (device) and `target/aarch64-apple-ios-sim/release/libdeltachat.a` (simulator).

   Both slices are then wrapped in an **XCFramework** (`libs/libdeltachat.xcframework`) via `xcodebuild -create-xcframework`. XCFramework is the modern Apple format for shipping a single library that contains multiple architecture/SDK slices — Xcode automatically picks the right slice per build destination, and the `.h` header travels with it. This is required because device-arm64 and simulator-arm64 cannot be merged with `lipo` (same arch, different SDK).

4. **Create build script** `scripts/build-core.sh` (target-installs + builds both slices + assembles `libs/libdeltachat.xcframework`). macOS-only.

5. **Xcode project setup:**
   - Drag `libs/libdeltachat.xcframework` into the project navigator and add it to the qxp target's "Frameworks, Libraries, and Embedded Content" (set to "Do Not Embed" — it's a static library inside an xcframework).
   - Create bridging header `qxp/Bridge/qxp-Bridging-Header.h`:
     ```c
     #include <deltachat.h>
     ```
     (The xcframework exposes its headers automatically; no Header Search Path edit needed.)
   - In Build Settings, set `SWIFT_OBJC_BRIDGING_HEADER = qxp/Bridge/qxp-Bridging-Header.h`.
   - Link `SystemConfiguration.framework` and `Security.framework` (required by core).

6. *(Removed — the `deltachat.h` header already declares all opaque types as proper forward declarations, e.g. `typedef struct _dc_context dc_context_t;`. No `wrapper.h` with redeclarations is needed; the bridging header alone is enough for Swift to import the full C API.)*

### Gotchas
- `cargo-lipo` is deprecated; we use individual `cargo build` per target + `xcodebuild -create-xcframework`.
- Simulator on Apple Silicon needs `aarch64-apple-ios-sim`, NOT `aarch64-apple-ios`. This MVP targets Apple Silicon only — no Intel simulator slice.
- Core depends on OpenSSL or ring for crypto — check if deltachat-ffi's Cargo.toml has the right features
- First build takes ~10-15 min (compiles entire Rust core)

---

## Phase 1: Swift Wrapper (Core/) — ✅ DONE (2026-04-13)

**Goal:** Thin Swift wrappers around ~40 C functions. Only what MVP needs.

**Outcome:** 7 Swift files created under `qxp/Core/` (DcAccounts, DcContext, DcChat, DcMsg, DcContact, DcChatlist, DcConstants). Ownership model: `DcAccounts` owns the root handle and borrows contexts (non-owning `DcContext`); `DcChat`/`DcMsg`/`DcContact`/`DcChatlist` own their pointers and release in `deinit`. String returns are funnelled through `dcTakeString` (copy + `dc_str_unref`). C constants are re-exposed as typed Swift enums (`DcMessageState`, `DcChatType`, `DcMessageViewType`, `DcEvent`).

### Files to create

**`qxp/Core/DcAccounts.swift`** — Account manager singleton
- Wraps `dc_accounts_t`
- `openDatabase(path:)` → `dc_accounts_new()`
- `add() -> Int` → `dc_accounts_add_account()`
- `get(id:) -> DcContext` → `dc_accounts_get_account()`
- `getSelected() -> DcContext` → `dc_accounts_get_selected_account()`
- `select(id:) -> Bool` → `dc_accounts_select_account()`
- `getAll() -> [Int]` → `dc_accounts_get_all()` + dc_array helpers
- `startIo()` → `dc_accounts_start_io()`
- `stopIo()` → `dc_accounts_stop_io()`
- `maybeNetwork()` → `dc_accounts_maybe_network()`
- `getEventEmitter() -> DcEventEmitter` → `dc_accounts_get_event_emitter()`
- `deinit` → `dc_accounts_unref()`

**`qxp/Core/DcContext.swift`** — Single account context
- Wraps `dc_context_t` (does NOT own the pointer — owned by DcAccounts)
- `setConfig(key:value:)` → `dc_set_config()`
- `getConfig(key:) -> String?` → `dc_get_config()`
- `isConfigured -> Bool` → `dc_is_configured()`
- `getChatlist(flags:query:) -> DcChatlist` → `dc_get_chatlist()`
- `getChat(id:) -> DcChat` → `dc_get_chat()`
- `getChatMsgs(chatId:) -> [Int]` → `dc_get_chat_msgs()`
- `getMessage(id:) -> DcMsg` → `dc_get_msg()`
- `sendTextMessage(chatId:text:)` → `dc_send_text_msg()`
- `getContact(id:) -> DcContact` → `dc_get_contact()`
- `marknoticedChat(id:)` → `dc_marknoticed_chat()`

**`qxp/Core/DcChat.swift`** — Chat model (value-like, owns pointer)
- `id`, `name`, `type` (single/group), `color`, `canSend`
- C calls: `dc_chat_get_*`, `dc_chat_unref` in deinit

**`qxp/Core/DcMsg.swift`** — Message model
- `id`, `text`, `timestamp`, `state`, `fromContactId`, `viewType`, `isFromCurrentSender`
- C calls: `dc_msg_get_*`, `dc_msg_unref` in deinit
- `isFromCurrentSender`: compare `fromContactId == DC_CONTACT_ID_SELF`

**`qxp/Core/DcContact.swift`** — Contact model
- `id`, `displayName`, `email`, `color`
- C calls: `dc_contact_get_*`, `dc_contact_unref` in deinit

**`qxp/Core/DcChatlist.swift`** — Chat list + summary
- `count`, `getChatId(at:)`, `getMsgId(at:)`, `getSummary(at:) -> ChatSummary`
- `ChatSummary` struct: `text1`, `text2`, `timestamp`
- C calls: `dc_chatlist_get_*`, `dc_lot_get_*`, unref in deinit

**`qxp/Core/DcConstants.swift`** — Map C constants to Swift
- Event IDs: `DC_EVENT_CONFIGURE_PROGRESS`, `DC_EVENT_INCOMING_MSG`, `DC_EVENT_MSGS_CHANGED`, etc.
- Message states: `DC_STATE_OUT_PENDING`, `DC_STATE_OUT_DELIVERED`, etc.
- Chat types: `DC_CHAT_TYPE_SINGLE`, `DC_CHAT_TYPE_GROUP`
- Config keys as strings: `"addr"`, `"mail_pw"`, etc.

### Helper pattern for C strings
```swift
func dcGetString(_ ptr: UnsafeMutablePointer<CChar>?) -> String {
    guard let ptr else { return "" }
    let str = String(cString: ptr)
    dc_str_unref(ptr)
    return str
}
```

---

## Phase 2: Event System + App State — ✅ DONE (2026-04-13)

**Goal:** Bridge core events to SwiftUI reactivity.

**Outcome:** `qxp/Core/DcEventHandler.swift` runs `dc_get_next_event` on a dedicated `Thread` and republishes typed `DcEventData` via a Combine `PassthroughSubject`; shutdown is by `dc_event_emitter_unref` (idempotent + `deinit`-safe). `qxp/State/AppState.swift` (`@Observable`, `@MainActor`) owns `DcAccounts`, the event handler, and login flow; wires `DC_EVENT_CONFIGURE_PROGRESS` into `isConfiguring` / `configProgress` / `isLoggedIn`. `qxpApp.swift` creates the `AppState`, injects it via `.environment`, runs `initialize()` in a `.task`, and pipes `scenePhase` into `handleScenePhase` to stop IO in background. `ContentView.swift` is temporarily a switchboard that shows "pending" placeholders; Phase 3 replaces it with `LoginView` / `ChatListView` routing inlined into `qxpApp.swift`.

**`qxp/Core/DcEventHandler.swift`** — Event loop on background thread
- Owns a `DcEventEmitter` (from `dc_accounts_get_event_emitter`)
- Runs `dc_get_next_event()` in a loop on a background `Task`
- Publishes typed events via `AsyncStream<DcEventData>` or Combine `PassthroughSubject`
- `DcEventData`: struct with `eventId`, `accountId`, `data1Int`, `data2Int`, `data2Str`
- Stops when emitter is freed or task cancelled

**`qxp/State/AppState.swift`** — Root state, `@Observable`
- Owns `DcAccounts` singleton
- Owns `DcEventHandler`
- Properties:
  - `isLoggedIn: Bool` (derived from dc_is_configured)
  - `isConfiguring: Bool`
  - `configProgress: Int` (0-1000)
  - `configError: String?`
- Methods:
  - `initialize()` — open database, check if account exists & configured
  - `login(email:password:)` — set config, start IO, listen for DC_EVENT_CONFIGURE_PROGRESS
  - `handleEvent(_:)` — dispatch events to the right place
- App lifecycle: `startIo()` on foreground, `stopIo()` on background

**Modify `qxp/qxpApp.swift`:**
- Create `AppState` as `@State`
- Route: if `isLoggedIn` → `ChatListView`, else → `LoginView`
- Pass AppState via `.environment()`
- Handle `scenePhase` changes for IO lifecycle

---

## Phase 3: Login Flow — ✅ DONE (2026-04-13)

**Goal:** Email + password login screen.

**Outcome:** `qxp/Views/LoginView.swift` — centered form, large "qxp" title, rounded-border `TextField`/`SecureField` with proper content types + autofill, `borderedProminent` submit button disabled while configuring, progress bar + status label during configure, inline red error otherwise. `qxpApp.swift` now routes via a private `RootView` (ProgressView → `LoginView` → placeholder) based on `isReady` / `isLoggedIn`. `ContentView.swift` deleted. Login wiring already lived in `AppState.login(email:password:)` from Phase 2 — nothing new there.

**`qxp/Views/LoginView.swift`**
- Design: centered form, generous whitespace
  - App name "qxp" in large title weight at top
  - `TextField("Email", text:)` with `.keyboardType(.emailAddress)`, `.textContentType(.emailAddress)`, `.autocapitalization(.none)`
  - `SecureField("Password", text:)` with `.textContentType(.password)`
  - `Button("Log In")` — `.buttonStyle(.borderedProminent)`, `.controlSize(.large)`
  - Disabled when fields empty or configuring
- When configuring:
  - Show `ProgressView` with `configProgress` percentage
  - Status text ("Connecting...", "Configuring...", "Done")
  - Cancel button
- Error: inline text in `.red` below button
- Action: calls `appState.login(email:, password:)`

**Login logic in AppState:**
1. `dc_set_config(ctx, "addr", email)`
2. `dc_set_config(ctx, "mail_pw", password)`
3. `dc_accounts_start_io(accounts)` — core auto-discovers IMAP/SMTP settings
4. Listen for `DC_EVENT_CONFIGURE_PROGRESS`:
   - `data1 == 0`: error (data2 has message)
   - `data1 == 1-999`: progress
   - `data1 == 1000`: success → set `isLoggedIn = true`

---

## Phase 4: Chat List — ✅ DONE (2026-04-13)

**Goal:** Display conversations.

**Outcome:** `qxp/Views/AvatarView.swift` renders a circle tinted from deltachat's 24-bit color + white initial. `qxp/State/ChatListViewModel.swift` (`@Observable @MainActor`) binds to `AppState`, subscribes to the events publisher, and rebuilds a `[ChatListItem]` from `dc_chatlist_t` + `dc_chatlist_get_summary` + `dc_get_fresh_msg_cnt` on any relevant event. `qxp/Views/ChatListRow.swift` lays out avatar + name + relative timestamp + preview + unread pill; `RelativeChatTimestampFormatter` handles today/weekday/date. `qxp/Views/ChatListView.swift` uses `NavigationStack` + `List` with pull-to-refresh (`maybeNetwork`), `ContentUnavailableView` for empty state, and a `.navigationDestination(for: UInt32.self)` placeholder to be replaced by `ChatView` in Phase 5. `AppState` now publishes a `PassthroughSubject<DcEventData, Never>` as its `events` property (fan-out after `handleEvent`). `DcContext.getFreshMsgCount(chatId:)` added. Routing in `qxpApp.swift` switched from placeholder `Text` to `ChatListView`.

**`qxp/State/ChatListViewModel.swift`** — `@Observable`
- `chats: [ChatListItem]` — array of display-ready items
- `ChatListItem`: struct with `chatId`, `name`, `lastMessagePreview`, `timestamp`, `unreadCount`, `color`, `chatType`
- `refresh()` — calls `context.getChatlist()`, maps to ChatListItems
- Subscribes to events: `DC_EVENT_INCOMING_MSG`, `DC_EVENT_MSGS_CHANGED`, `DC_EVENT_CHAT_MODIFIED` → triggers `refresh()`

**`qxp/Views/ChatListView.swift`**
- `NavigationStack` with `.navigationTitle("Chats")` (large)
- `List(viewModel.chats)` with `NavigationLink` to `ChatView`
- Each row: `ChatListRow`
- Pull-to-refresh: `.refreshable { appState.accounts.maybeNetwork() }`
- Empty state: "No conversations yet"

**`qxp/Views/ChatListRow.swift`**
- Layout: `HStack`
  - `AvatarView(name:color:size: 48)`
  - `VStack(alignment: .leading)`:
    - `HStack`: name (`.font(.body.weight(.semibold))`) + Spacer + timestamp (`.font(.caption)`, `.foregroundStyle(.secondary)`)
    - Preview text (`.font(.subheadline)`, `.foregroundStyle(.secondary)`, `.lineLimit(2)`)

**`qxp/Views/AvatarView.swift`**
- Circle with background color (from `dc_*_get_color`, converted to SwiftUI `Color`)
- White initial letter, centered
- Parameters: `name: String`, `color: UInt32`, `size: CGFloat`

---

## Phase 5: Chat Conversation — ✅ DONE (2026-04-13)

**Goal:** View and send messages.

**Outcome:** `qxp/State/ChatViewModel.swift` (`@Observable @MainActor`) loads `[MessageItem]` via `dc_get_chat_msgs` + `dc_get_msg`, skips special marker IDs (≤9), resolves sender name/color via `dc_get_contact` for incoming messages, calls `dc_marknoticed_chat` on load, and filters events by chat_id (`data1Int`). `qxp/Views/MessageBubble.swift` renders outgoing (accent, right, white text) / incoming (systemGray6, left) / info (centered caption), with timestamp footer + SF Symbol state glyph for outgoing. `qxp/Views/MessageInputBar.swift` is a vertical-growing `TextField` (1–5 lines) + circular send button, tinted accent and disabled on empty. `qxp/Views/ChatView.swift` uses `ScrollViewReader` + `LazyVStack` with auto-scroll to the last message on update, `.safeAreaInset(.bottom)` for the input bar, inline nav title. `ChatListView`'s navigation destination now routes to `ChatView(chatId:)`.

**`qxp/State/ChatViewModel.swift`** — `@Observable`
- `messages: [MessageItem]` — display-ready
- `MessageItem`: struct with `id`, `text`, `timestamp`, `isOutgoing`, `state`, `senderName`, `senderColor`
- `chatName: String`, `chatId: Int`
- `load()` — `dc_get_chat_msgs()` → map each msgId via `dc_get_msg()` → MessageItem
- `send(text:)` — `dc_send_text_msg()`
- Subscribes to `DC_EVENT_INCOMING_MSG` / `DC_EVENT_MSGS_CHANGED` for this chatId → reload
- On appear: `dc_marknoticed_chat()` to mark as read

**`qxp/Views/ChatView.swift`**
- `NavigationStack` inline title (chat name)
- `ScrollViewReader` + `ScrollView` with `LazyVStack`:
  - For each message: `MessageBubble`
  - Auto-scroll to bottom on new messages (`scrollTo(lastId, anchor: .bottom)`)
- `MessageInputBar` pinned to bottom via `.safeAreaInset(edge: .bottom)`
- `.onAppear { viewModel.load() }`

**`qxp/Views/MessageBubble.swift`**
- `HStack` with conditional alignment:
  - Outgoing: `Spacer()` + bubble (right)
  - Incoming: bubble (left) + `Spacer()`
- Bubble: `Text` with padding, background, `.clipShape(RoundedRectangle(cornerRadius: 18))`
  - Outgoing: `.accent` background, `.white` text
  - Incoming: `Color(.systemGray6)` background, `.primary` text
- Below bubble: timestamp in `.font(.caption2)`, `.foregroundStyle(.tertiary)`
- Max width: ~75% of screen (`maxWidth: geo.size.width * 0.75`)
- For group chats: show sender name above bubble in `.font(.caption)` with sender color

**`qxp/Views/MessageInputBar.swift`**
- `HStack`:
  - `TextField("Message", text: $text, axis: .vertical)` with `.lineLimit(1...5)`
    - Rounded rect background: `Color(.systemGray6)`, corner radius 20
    - Padding inside
  - Send button: `Image(systemName: "arrow.up.circle.fill")`, `.font(.title2)`
    - Tinted `.accent`, disabled + dimmed when text is empty
    - On tap: send message, clear text
- Background: `.ultraThinMaterial` or system background
- Keyboard-aware via SwiftUI's automatic avoidance

---

## Phase 6: Polish & Test — ⏳ CODE DONE / DEVICE TEST PENDING (2026-04-13)

**Fix landed during review:** `AppState.login` previously only called `startIo`; core actually needs an explicit `dc_configure()` to kick off autoconfigure — added `DcContext.configure()` and call it after `setConfig`. On `DC_EVENT_CONFIGURE_PROGRESS` 1000 we now call `accounts.startIo()` to bring up IMAP/SMTP IO.

**Code-side checklist (reviewed, satisfied):**
1. **Dark mode** — all views use semantic colors (`.primary`, `.secondary`, `Color(.systemGray6)`, `Color.accentColor`, `.bar`). Automatic.
2. **Keyboard handling** — `.safeAreaInset(.bottom)` on input bar + `.scrollDismissesKeyboard(.interactively)` in `ChatView`.
3. **Message ordering** — relies on core: `dc_get_chat_msgs` already returns IDs in sort order; `DcMsg.timestamp` uses `dc_msg_get_sort_timestamp` (same ordering). No local sort needed.
4. **Concurrent access** — view models are `@MainActor`; event loop runs on a dedicated `Thread`, hops to main via `DispatchQueue.main` before state mutation. Core is thread-safe per `deltachat.h`.
5. **Memory** — every DC pointer-owning wrapper unrefs in `deinit` (`DcAccounts`, `DcChat`, `DcMsg`, `DcContact`, `DcChatlist`). `DcContext` borrows (no unref). `DcEventHandler.stop()` unrefs emitter idempotently. Event objects are `dc_event_unref`'d per iteration.
6. **Edge cases** — empty chat list handled (`ContentUnavailableView`); long messages wrap via default `Text` behavior; `TextField` grows 1–5 lines.

**Pending manual verification on device (user):**
- Login with real email account.
- Chat list populates with existing conversations.
- Open chat → send text → arrives on other DC client.
- Receive from other client → appears live in qxp (event-driven refresh).
- Background/foreground cycle: IO stops/resumes via `scenePhase`.
- Dark mode toggle.

---

## File Summary

### New files (17)
```
qxp/Bridge/qxp-Bridging-Header.h
qxp/Core/DcAccounts.swift
qxp/Core/DcContext.swift
qxp/Core/DcChat.swift
qxp/Core/DcMsg.swift
qxp/Core/DcContact.swift
qxp/Core/DcChatlist.swift
qxp/Core/DcEventHandler.swift
qxp/Core/DcConstants.swift
qxp/State/AppState.swift
qxp/State/ChatListViewModel.swift
qxp/State/ChatViewModel.swift
qxp/Views/LoginView.swift
qxp/Views/ChatListView.swift
qxp/Views/ChatListRow.swift
qxp/Views/ChatView.swift
qxp/Views/MessageBubble.swift
qxp/Views/MessageInputBar.swift
qxp/Views/AvatarView.swift
scripts/build-core.sh
```

### Modified files (2)
```
qxp/qxpApp.swift — routing + lifecycle
qxp/ContentView.swift — DELETE (replaced by proper views)
```

### Build artifacts (not in git)
```
libs/libdeltachat.xcframework/   (built by scripts/build-core.sh; gitignored)
libs/deltachat-core-rust/        (git submodule — pinned commit IS in git, the working tree contents are not)
```

---

## Verification

1. **Build**: Project compiles with no errors
2. **Login**: Enter email+password → progress bar → success → chat list appears
3. **Chat list**: Shows existing conversations from the account
4. **Open chat**: Tap conversation → see message history
5. **Send message**: Type text, tap send → message appears in bubble → received on other DC client
6. **Receive message**: Send from other DC client → message appears in qxp in real time
7. **Dark mode**: Toggle system appearance → all views adapt correctly
8. **Background/foreground**: App resumes without re-login, picks up new messages
