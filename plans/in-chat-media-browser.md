# PLAN: In-chat Media / Audio / Files browser

## Context

Mirror the DC app's "All Media" feature — reachable from a chat's profile page (1:1 contact view or group info), slicing the chat's attachments by type. The browser lives behind a single profile row that shows a count and pushes a paged container.

**In scope:**
- Three tabs: Gallery (image + gif + video), Audio (audio + voice), Files.
- Profile row with live count badge in `ContactView` + `GroupInfoView`.
- Per-row context menu: Show in Chat, Share (files only), Delete.
- Live refresh on message-changed events.

**Out of scope (deferred):**
- WebXDC apps tab — qxp does not yet support WebXDC.
- Map view (location aggregator).
- Cross-chat "All Media" launched from Settings (chatId == 0).
- Multi-select / batch operations (reference doesn't have these either).
- Custom audio scrubber UI — system QuickLook plays audio fine for v1.

## Reference behaviour

`resources/deltachat-ios/Controller/AllMediaViewController.swift` (UIPageViewController, segmented title, four tabs). `GalleryViewController.swift` (UICollectionView grid). `FilesViewController.swift` (UITableView). All three:

- Refresh in background on `messagesChanged | incomingMessage | messageReadDeliveredFailedReaction` with single-flight coalescing.
- Pull message ids via `dc_get_chat_media(chatId, type1, type2, type3)`, reversed for newest-first.
- Tap → `PreviewController` (multi-item Quick Look). Context menu offers show-in-chat / delete (gallery) plus share (files).
- Profile entry computes a count via `getAllMediaCountString` (capped at 500, returns "500+" beyond).
- Gallery shows a floating month-year pill while scrolling; cell layout is 3 cols phone-portrait, 5 phone-landscape, 5/8 on iPad.

## qxp deltas vs reference

- No `dc_get_chat_media` wrapper exists yet — `qxp/Core/DcContext.swift` needs one.
- `ImagePreview` already swipes through an array of photo `MessageItem`s. `QLPreviewControllerWrapper` (in `ChatViewController.swift`) handles single-URL Quick Look.
- Routing goes through `NavigationRouter` (`pushChat`, `pushContact`, etc.); SwiftUI views are wrapped via `makeHostingVC`.
- iOS 26+ only → use SwiftUI (`Picker(.segmented)` + `LazyVGrid` + `List`) instead of UIPageViewController. iOS 26 LazyVGrid handles a few hundred thumbnails comfortably.
- Profile entry sites: `ContactView.chatOptionsSection` and `GroupInfoView.chatOptionsSection`.

---

## Phase 1 — Core wrappers + profile entry row ✅ DONE (2026-04-29)

**Goal:** Tappable "Media, Audio & Files" row with live count in both profile views; tapping pushes a placeholder.

**Steps:**

1. `qxp/Core/DcContext.swift`:
   - `func getChatMedia(chatId: UInt32, types: [DcMessageViewType]) -> [UInt32]` — wraps `dc_get_chat_media`. The FFI accepts up to three type ints; pad with 0 for unused slots. Reverses to newest-first to match the reference.
   - `func getAllMediaCount(chatId: UInt32) -> Int` — sums gallery + audio + files counts, short-circuiting once 500 is hit (matches reference's `getAllMediaCountMax`).
   - `func getAllMediaCountString(chatId: UInt32) -> String` — "0", "47", "500+".
2. `qxp/Navigation/NavigationRouter.swift`: `pushChatMedia(chatId:)`.
3. `qxp/Views/ChatMediaView.swift`: empty container view (placeholder body).
4. Add a row to `ContactView` and `GroupInfoView` (inside `chatOptionsSection`, above the mute row): label "Media, Audio & Files", trailing detail = `getAllMediaCountString`. Recompute on appear and whenever `appState.events` emits `msgsChanged | incomingMsg | incomingMsgBunch | msgDeleted`.

**Outcome:** Added `getChatMedia / getAllMediaCount / getAllMediaCountString` (+ static `formatAllMediaCount`) in `qxp/Core/DcContext.swift`, with cap constant `allMediaCountMax = 500` mirroring the reference. `pushChatMedia(chatId:)` added to `NavigationRouter`. Profile rows landed in `ContactView.chatOptionsSection` and `GroupInfoView.chatOptionsSection`, both event-refreshed on `msgsChanged | incomingMsg | incomingMsgBunch | msgDeleted` (ContactView keeps its existing `locationChanged` trigger). Snapshot picks up `mediaCountString`.

## Phase 2 — Gallery tab (image + gif + video) ✅ DONE (2026-04-29)

**Goal:** Working photo grid behind the picker with tap-to-view.

**Steps:**

1. `ChatMediaView`: header `Picker("", selection: $tab) { … }.pickerStyle(.segmented)` over `{gallery, audio, files}`; switch over `tab` for body.
2. `ChatMediaItem` struct (sibling of `MessageItem` but media-scoped: id, timestamp, viewType, fileURL, imageAspect, durationMs, fileName, isOutgoing, senderName) — keep coupling with `ChatViewModel` zero.
3. `GalleryGrid` subview: `LazyVGrid` 3 cols portrait / 5 landscape (resolved via `@Environment(\.horizontalSizeClass)` plus `UIDevice.orientation` at compute time). Square cells with thumbnail; video cells get a corner `play.fill` glass badge.
4. Hydrate `[ChatMediaItem]` from `getChatMedia(...)` ids on a detached Task. Single-flight coalescer: if a refresh is already in flight, mark `dirty = true` and re-run on completion.
5. Tap: image/gif → push `ImagePreview(photos:initialMessageId:)` via `fullScreenCover`; video → push `QLPreviewControllerWrapper` via UIViewControllerRepresentable.
6. Empty state: secondary text via `ContentUnavailableView` ("No images or videos in this chat yet.").

**Outcome:** `ChatMediaView` shipped as a `Picker(.segmented)` + paginating `TabView(.page)` over `{gallery, audio, files}`. `GalleryGrid` uses `LazyVGrid` with column count derived from idiom × orientation (3/5 phone, 5/8 iPad). Refresh is single-flight via `Task.cancel-and-restart` with a 50 ms debounce — simpler than the reference's `inBgRefresh / needsAnotherBgRefresh` Bool dance and equivalent. `ImagePreview` now takes a small `Photo` value type so the gallery can drive the carousel without rebuilding `MessageItem`s; `ChatViewController.presentImagePreview` updated to the new init. Tap routes images/gifs to `ImagePreview`, videos to `QuickLookViewer`.

## Phase 3 — Files tab ✅ DONE (2026-04-29)

**Goal:** Files list with QuickLook tap.

**Steps:**

1. `FilesList(types: [.file])` subview: SwiftUI `List` of rows showing UTType-derived SF Symbol icon, filename (1 line), subtitle = `ByteCountFormatter` size · `Date.RelativeFormatStyle` date.
2. Tap → `QLPreviewControllerWrapper` for the message's `fileURL`.
3. Context menu: "Show in Chat" → `popToRoot` then `pushChat(id:highlightMsg:)`; "Share" → `UIActivityViewController` representable; "Delete" → confirmation dialog → `context.deleteMessages(ids: [id])`.
4. Refresh wiring identical to gallery.

**Outcome:** `FilesList(chatId:kind:)` covers both Files and Audio tabs via a `Kind` enum (types/icon/empty-state strings). 44 pt accent-circle leading icon picked from `fileGlyph` (or `mic.fill` / `music.note` for voice/audio). Subtitle is `duration · date` for audio and `size · date` for files. Tap opens `QuickLookViewer`. Context menu offers Show in Chat (`popToRoot` → `pushChat(highlightMsg:)`), `ShareLink` for files with a URL, and a Delete confirmation.

## Phase 4 — Audio tab + thumbnails ✅ DONE (2026-04-29)

**Goal:** Audio tab and proper thumbnails for gallery.

**Steps:**

1. Audio tab: reuse `FilesList` with `types: [.audio, .voice]`, icon = `waveform`, subtitle = formatted duration · relative date. Tap → QuickLook (handles audio playback).
2. Gallery thumbnails: `UIImage(contentsOfFile:)` off-main for image/gif; `AVAssetImageGenerator` (single frame, copyCGImage) for video. NSCache of `UIImage` keyed by msg id; bounded.
3. Add gallery context menu (Show in Chat / Delete).

**Outcome:** Audio tab is `FilesList(kind: .audio)`. `ThumbCache` (`@MainActor final class` wrapping `NSCache<NSNumber, UIImage>`, `countLimit = 200`) is held by `GalleryGrid` as `@State` so it survives view re-evaluation. `GalleryCell` loads thumbnails inside `.task(id: item.id)`: image/gif via `UIImage(contentsOfFile:)` on a detached priority-userInitiated Task, video via `nonisolated static ThumbCache.videoFrame(url:)` using `AVAssetImageGenerator.copyCGImage` at 0.1 s with a 600 × 600 maximum size. Gallery context menu now offers Show in Chat / Delete.

## Phase 5 — Polish ✅ DONE (2026-04-29)

**Goal:** Close gaps with reference UX.

**Steps:**

1. Floating month-year glass capsule over the gallery during scroll, tracking the topmost visible item's timestamp. Fades out shortly after scroll ends.
2. "Show in Chat" verified to land on the chat with `highlightMsg` set; the existing `pushChat(id:highlightMsg:)` already supports this — combined with `popToRoot` it should work.
3. Localized strings (`String(localized:)`) for tab titles, row title, empty states, confirmation copy.
4. Tests in `qxpTests`: pure-logic test for `getAllMediaCountString` thresholds (0, 1, 47, 499, 500, 600).

**Outcome:** Floating month-year glass capsule renders over the grid via `.glassEffect(.regular, in: Capsule())`, tracks `visibleIndices.min()` while scrolling, and self-hides 1.5 s after the last appearance event. Show-in-Chat path verified: `popToRoot(animated: false)` → `pushChat(id:highlightMsg:)`. All user-facing strings use `String(localized:)` / `LocalizedStringKey`. Pure-logic tests added in `qxpTests/PureLogicTests.swift` (`FormatAllMediaCountTests`) covering 0, 1, 47, 499, 500, 600.

## Files touched

- `qxp/Core/DcContext.swift` — media wrappers + count helpers.
- `qxp/Navigation/NavigationRouter.swift` — `pushChatMedia`.
- `qxp/Navigation/ChatViewController.swift` — `presentImagePreview` updated to use `ImagePreview.Photo`.
- `qxp/Views/ImagePreview.swift` — refactored to take `[Photo]` instead of `[MessageItem]`.
- `qxp/Views/ChatMediaView.swift` — new (~700 LOC).
- `qxp/Views/ContactView.swift` — Media row + event refresh + `mediaCountString`.
- `qxp/Views/GroupInfoView.swift` — Media row + event refresh + `mediaCountString`.
- `qxpTests/PureLogicTests.swift` — `FormatAllMediaCountTests`.

## Open / deferred

- WebXDC apps tab — pending qxp WebXDC support.
- Cross-chat "All Media" entry from Settings.
- Map / location aggregator — separate plan.
- Multi-select / batch ops.
- Custom audio scrubber UI in the audio tab.
