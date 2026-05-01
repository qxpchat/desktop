# PLAN: Sharing Suggestions + Share Extension

## Context

Make qxp a first-class share target on iOS 26 so that **(a)** the user's qxp chats appear in the Share Sheet's "Sharing Suggestions" recipient row when sharing from any other app, and **(b)** picking qxp from the Share Sheet hands off to a qxp share extension that posts the content into the chosen chat without ever launching the main app.

Two pieces are required and they are independent:

1. **Intent donations** (`INSendMessageIntent`) from the main app on every send and on chat open. iOS uses these to populate the suggestions row. Donations alone do not make qxp appear in the share sheet — they only score recipients *for an existing share target*.
2. **A Share Extension target** that declares `IntentsSupported = [INSendMessageIntent]` so the suggestion row is offered for qxp specifically, and that runs the actual chat-picker + send pipeline.

The extension and the main app must share the DC account directory so the extension can read the chatlist and write outgoing messages. That requires moving the accounts dir from the main-app sandbox into an **App Group** container — this is the only real refactor in the plan.

### Out of scope

- Account picker step inside the extension. DC's share extension lets you pick which logged-in account to share *from*; qxp doesn't expose multi-account in its main UI, so the extension will just write to `accounts.getSelected()`. Revisit if/when qxp grows account switching.
- Sharing *from* qxp into other apps (already works via stock `UIActivityViewController`).
- App Intents / Siri / Shortcuts surfaces. iOS 26's Share Sheet recipient row is still `INSendMessageIntent`-driven; App Intents covers Siri/Shortcuts/Spotlight, not this surface. Re-evaluate when Apple migrates the surface.
- macOS — out of milestone (iOS-only).

### Constraints

- iOS 26+, Liquid Glass, no Swift/ObjC dependencies (CLAUDE.md). Extension UI is SwiftUI hosted via `UIHostingController` from the principal `UIViewController`.
- I cannot run Xcode on this machine. New target/scheme creation in `qxp.xcodeproj` is the user's job; this plan prepares everything *around* the target — see the **Xcode wiring** checklist below.
- `libs/deltachat-core-rust` pinned at v2.49.0 (per MVP.md). Extension links the same `libdeltachat.xcframework`.
- App Group identifier: **`group.limo.eth.qxp`** (matches main-app bundle prefix `limo.eth.qxp`).

---

## Reference behaviour

Sources read: `references/deltachat-ios/DcShare/` (target), `references/deltachat-ios/DcShare/Info.plist`, `references/deltachat-ios/DcCore/DcCore/Helper/DcUtils.swift`, `references/deltachat-ios/deltachat-ios/Helper/RelayHelper.swift`, `references/Signal-iOS/SignalShareExtension/`.

**Donation shape (`DcUtils.donateSendMessageIntent`).** Build an `INSendMessageIntent` with `recipients: nil`, `outgoingMessageType: .outgoingMessageText`, `speakableGroupName: INSpeakableString(spokenPhrase: chat.name)`, `conversationIdentifier: "\(contextId).\(chatId)"`, everything else nil. Attach the chat's profile image (or generated avatar) via `setImage(_, forParameterNamed: \.speakableGroupName)`. Wrap in `INInteraction(intent:response: nil)`, set `groupIdentifier = "\(contextId)"`, call `donate { … }`. The `groupIdentifier` is what lets us bulk-delete donations on logout.

**Where DC donates.** Only after a successful send — `RelayHelper.shareAndFinishRelaying(to:)` donates after `dc_send_msg`. DC does *not* donate on chat open. We donate in *both* places: on every send (definitive signal) and on chat open (cheap fallback so freshly-installed accounts get suggestions before they've sent anything).

**Extension Info.plist (DC).** `NSExtensionPointIdentifier = com.apple.share-services`, `IntentsSupported = [INSendMessageIntent]`, `NSExtensionMainStoryboard = MainInterface`, activation rule a `SUBQUERY` that requires every attachment to conform to one of `public.image | public.audio | public.movie | public.plain-text | public.url`. Ours uses the same UTIs plus `public.file-url` and `public.data`, and a programmatic `NSExtensionPrincipalClass` instead of a storyboard.

**Extension entitlements (DC).** `com.apple.security.application-groups` with the shared group ID. Main app entitlements get the same group. The DC accounts directory is then placed under that group's container.

**Extension UI flow (DC, summarised — UIKit/storyboard, ours is SwiftUI):**
1. `ShareViewController` reads `extensionContext.inputItems`, materialises attachments to disk under a temp dir inside the shared group.
2. Presents a chat-picker (account list + chat list).
3. On pick: opens `dc_accounts_t` against the shared accounts dir, builds a `DcMsg` per attachment, calls `dc_send_msg`, donates an `INSendMessageIntent`, then `extensionContext.completeRequest`. Cleanup: deletes the temp dir.

**Concurrency (DC core).** SQLite is in WAL mode; multi-process open against the same DB is supported. The extension and main app may both have the accounts open simultaneously without coordination — but only one process should be running IO (`dc_accounts_start_io`) at a time. Our extension does *not* start IO; it writes outgoing messages to the local DB and lets whichever process resumes IO next deliver them. Same approach as DC.

---

## Phase 1: Move accounts dir to App Group container — ✅ DONE (2026-05-01)

**Goal:** The DC accounts directory lives inside an App Group container shared by the main app and the future share extension. No behaviour change.

**Outcome:** New `qxp/Core/AppGroup.swift` exposes `identifier`, `containerURL`, `accountsDirectory`, and `shareTempDirectory`. `AppState.initialize()` calls `migrateLegacyAccountsIfNeeded()` (one-shot move from `applicationSupportDirectory/accounts/*` into the App Group container) before opening accounts, then resolves the path via `AppGroup.accountsDirectory`. Created `qxp/qxp.entitlements` declaring `com.apple.security.application-groups = [group.limo.eth.qxp]` — file is on disk, the user wires it into the project in Xcode (see **Xcode wiring** below). `containerURL` `fatalError`s if the entitlement is missing (intentional — silently falling back would accumulate two databases). Migration deletes the legacy directory after a successful move; logs a warning on partial failure.

Files touched:
- `qxp/Core/AppGroup.swift` (new)
- `qxp/qxp.entitlements` (new)
- `qxp/State/AppState.swift` — replaced `accountsDirectory()` with `AppGroup.accountsDirectory`; added `migrateLegacyAccountsIfNeeded`.

---

## Phase 2: Donate `INSendMessageIntent` from send + chat-open paths — ✅ DONE (2026-05-01)

**Goal:** Every send and every chat-open donates an interaction so iOS can rank that chat in the suggestions row.

**Outcome:** `qxp/Core/IntentDonation.swift` (`nonisolated`, multi-targeted with the share extension) exposes two entry points: `donateSendMessage(contextId:chatId:chatName:avatarImage:)` and `deleteDonations(contextId:)`. `qxp/Views/AvatarRenderer.swift` (main-app only) snapshots `AvatarView` to `UIImage` via `ImageRenderer @ scale 2`, caches by `(name, color, size)`, and exposes `intentImage(profileImageURL:name:color:)` which prefers the chat's profile image off disk and falls back to the rendered initials. Donation hooks: `ChatViewModel.send()` after the send loop; `ChatViewController.viewDidAppear` (skipped when `isPreview`); `INInteraction.delete(with:)` from both `AppState.removeAccount(id:)` and `AppState.logout()` so stale chats stop appearing on sign-out. `groupIdentifier` is `"\(contextId)"`; `conversationIdentifier` is `"\(contextId).\(chatId)"`.

Files touched:
- `qxp/Core/IntentDonation.swift` (new — multi-target with qxpShare)
- `qxp/Views/AvatarRenderer.swift` (new — main-app only)
- `qxp/State/ChatViewModel.swift` — donate after send loop
- `qxp/Navigation/ChatViewController.swift` — donate in `viewDidAppear` (guarded by `!isPreview`)
- `qxp/State/AppState+Accounts.swift` — `deleteDonations` in `removeAccount(id:)` and `logout()`

Not wired:
- `sendEdit()` is intentionally not a donation site. Editing an already-sent message doesn't add a "user wants to talk to this chat" signal beyond the original send.
- Forwarding: `presentForwardConfirm` always navigates the user to the destination chat first, which triggers `viewDidAppear` and donates there. No separate hook needed.

---

## Phase 3: Scaffold the `qxpShare` extension target — ✅ CODE READY / AWAITS XCODE (2026-05-01)

**Goal:** All extension source files exist on disk in `qxpShare/`. User creates the matching Xcode target and wires file/target membership in one sitting.

**Outcome:** Files written to `qxpShare/`:
- `ShareViewController.swift` — `UIViewController` principal class, hosts `ShareRootView` via `UIHostingController`, bridges `complete`/`cancel` to `extensionContext`.
- `Info.plist` — `NSExtensionPointIdentifier = com.apple.share-services`, `NSExtensionPrincipalClass = $(PRODUCT_MODULE_NAME).ShareViewController`, `IntentsSupported = [INSendMessageIntent]`, activation rule for image/audio/movie/text/url/file-url/data UTIs. `NSExtensionMainStoryboard` deliberately omitted — programmatic UIKit + SwiftUI host.
- `qxpShare.entitlements` — `com.apple.security.application-groups = [group.limo.eth.qxp]`.
- `Bridging-Header.h` — `#include <deltachat.h>`.

`UIDesignRequiresCompatibility` is *not* set (DC's reference sets it to true to opt out of Liquid Glass; we want it on).

---

## Phase 4: Share extension UI + send pipeline — ✅ CODE READY / AWAITS XCODE (2026-05-01)

**Goal:** Picking qxp from the Share Sheet shows a Liquid Glass chat picker; tapping a chat sends the content into it.

**Outcome:** Files written to `qxpShare/`:

- `ShareSendController.swift` — `nonisolated enum`, no UI dependencies. `loadChats()` opens `DcAccounts(path: AppGroup.accountsDirectory.path)`, takes the selected context, and returns `[SharePickerChat]` (Sendable, marked `nonisolated struct` so its synthesised init is callable from a nonisolated context under `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`). Filters out special chat IDs ≤ 9, contact requests, device-talk, and chats that can't accept outgoing messages; pinned chats float to the top. `send(toChatId:items:)` materialises every `NSItemProvider` (image / movie / audio / file-URL / URL / text / data) into `AppGroup.shareTempDirectory`, opens accounts, builds one `DcMsg` per file (text/URL becomes a leading text message or caption on the first attachment), calls `dc_send_msg`, donates via `IntentDonation.donateSendMessage(... avatarImage:)` with the chat's profile image (if any), and deletes the temp files. Image dimensions are read from `UIImage(data:)` so the recipient renders aspect-correctly. The extension does **not** start IO — outgoing messages sit in the outbox until the main app foregrounds.

- `ShareRootView.swift` — `@MainActor` SwiftUI. `NavigationStack` + `List` of `SharePickerChat` rows, `.searchable(text:)`, inline title `"Share with…"`, leading **Cancel** toolbar item that calls `extensionContext.cancelRequest`. Three phases: `.loading` (`ProgressView`), `.empty` (`ContentUnavailableView` "Open qxp first"), `.ready([SharePickerChat])`. Tap-to-send shows a `SendingOverlay` (single floating capsule using `.glassEffect(.regular, in: RoundedRectangle)` per Liquid Glass rules — no fake materials). Errors surface in an `.alert` whose dismiss action also cancels the share sheet. `SharePickerRow` renders avatar (profile image off disk, or coloured circle with initial), name, verified shield, pinned label, muted glyph. Local `shareRGB(_:)` helper is inlined; `qxp/Views/SharedExtensions.swift` is *not* multi-targeted.

Verification (manual, on device):
- Share a single image from Photos → qxp shows in the Share Sheet → chat list → pick a chat → image arrives in qxp main app on next foreground.
- Share a URL from Safari → arrives as a text message with the URL.
- Share text selection → arrives as a text message.
- Share multiple images → all arrive (one message per image, mirroring `ChatViewModel.send()`).
- Sharing Suggestions row in Photos shows a few qxp chats once the extension is installed and donations from Phase 2 have accumulated.

---

## Xcode wiring (do this next, on the Mac)

The Swift, Info.plist, and entitlements files are on disk. The remaining steps require Xcode.

### A. Main-app target

1. **File inspector → add to qxp target:**
   - `qxp/Core/AppGroup.swift`
   - `qxp/Core/IntentDonation.swift`
   - `qxp/Views/AvatarRenderer.swift`
2. **Signing & Capabilities → qxp target:** turn on **App Groups**, tick `group.limo.eth.qxp` (create it on developer.apple.com first if needed).
3. **Build Settings → qxp target:** set `CODE_SIGN_ENTITLEMENTS = qxp/qxp.entitlements` (or let Xcode point at it automatically when you toggle the capability).

### B. Create the share extension target

1. **File → New → Target → "Share Extension"**. Product Name `qxpShare`, language Swift, embed in `qxp`. Deployment target iOS 26.
2. **Delete the auto-generated** `qxpShare/ShareViewController.swift`, `qxpShare/MainInterface.storyboard`, `qxpShare/Info.plist` from disk *and* the project navigator.
3. **Drag in the prepared files** from `qxpShare/` already on disk:
   - `ShareViewController.swift` (qxpShare target only)
   - `ShareRootView.swift` (qxpShare target only)
   - `ShareSendController.swift` (qxpShare target only)
   - `Info.plist` (qxpShare target — set as the Info.plist in build settings)
   - `qxpShare.entitlements` (qxpShare target — set `CODE_SIGN_ENTITLEMENTS`)
   - `Bridging-Header.h` — set `SWIFT_OBJC_BRIDGING_HEADER = qxpShare/Bridging-Header.h` for the qxpShare target.
4. **Multi-target membership** — tick **qxpShare** (in addition to qxp) for these existing files in the file inspector:
   - `qxp/Core/AppGroup.swift`
   - `qxp/Core/IntentDonation.swift`
   - `qxp/Core/Logger.swift`
   - `qxp/Core/DcAccounts.swift`
   - `qxp/Core/DcContext.swift`
   - `qxp/Core/DcChat.swift`
   - `qxp/Core/DcChatlist.swift`
   - `qxp/Core/DcMsg.swift`
   - `qxp/Core/DcContact.swift`
   - `qxp/Core/DcLot.swift`
   - `qxp/Core/DcProvider.swift`
   - `qxp/Core/DcBackupProvider.swift`
   - `qxp/Core/DcConstants.swift`
5. **Frameworks & Libraries (qxpShare target):** link **Do Not Embed** for `libs/libdeltachat.xcframework` + `SystemConfiguration.framework` + `Security.framework`; link **regular** for `Intents.framework` + `UIKit.framework` + `SwiftUI.framework` (last two are usually implicit). 
6. **Signing & Capabilities → qxpShare target:** turn on **App Groups**, tick `group.limo.eth.qxp` (same one as the main app).
7. **Build Settings → qxpShare target:**
   - `IPHONEOS_DEPLOYMENT_TARGET = 26.0`
   - `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (match main app)
   - `SWIFT_VERSION = 6.0`

### C. Verify

Build the qxpShare scheme. Expected:
- Builds clean.
- Running the qxp host on a device shows qxp inside the iOS Share Sheet when sharing image / URL / text.
- Tapping qxp opens a chat picker; tapping a chat sends the content; main app shows the message after the next foreground (extension does not run IO).

---

## File summary

### New files (12)
```
qxp/Core/AppGroup.swift
qxp/Core/IntentDonation.swift
qxp/Views/AvatarRenderer.swift
qxp/qxp.entitlements
qxpShare/ShareViewController.swift
qxpShare/ShareRootView.swift
qxpShare/ShareSendController.swift
qxpShare/Info.plist
qxpShare/qxpShare.entitlements
qxpShare/Bridging-Header.h
```

### Modified files (4)
```
qxp/State/AppState.swift              — accounts dir → App Group + migration
qxp/State/AppState+Accounts.swift     — deleteDonations on remove/logout
qxp/State/ChatViewModel.swift         — donate after send loop
qxp/Navigation/ChatViewController.swift — donate in viewDidAppear
```

---

## Open questions / deferred

1. **DcCore framework split.** Current solution is multi-target file membership. Long-term, extract `qxp/Core/` into a `qxpCore.framework` so both targets `import qxpCore` and stop sharing source. Defer to a follow-up plan when the duplication starts to bite (renames, build-time, target-membership drift).
2. **Notification Service Extension.** The same App Group plumbing would let us add a notification service extension for richer push handling. Not in this plan.
3. **Multi-account picker in extension.** DC offers it; we don't (single selected account today). Revisit once qxp's main UI grows account switching.
4. **App Intents migration.** Track Apple's direction; if iOS 27 moves the Share Sheet recipient row to App Intents, we re-target.
5. **Donation rate-limiting.** Donating on every `viewDidAppear` and every send. iOS dedupes by `conversationIdentifier`, so this should be fine — but if profiling shows churn, add an in-memory "last donated at" map keyed by chatId with a 30s window.
6. **Privacy manifest.** `qxpShare/PrivacyInfo.xcprivacy` not yet copied — App Store review will flag if the extension uses any required-reason APIs not declared. Audit before submitting.
