# PLAN: ChatView Old-School UIKit Rewrite (drop Liquid Glass)

## Context

The chat-view *shell* is already UIKit (`qxp/Navigation/ChatViewController.swift` —
inverse-transformed `UITableView` + `UITableViewDiffableDataSource` + custom
`inputAccessoryView`, shipped in `plans/chatview-uikit.md`). What runs *inside*
the shell is still SwiftUI: every bubble cell, every chrome row, the chat
title, the input bar, the attachment pane, and several banners are hosted via
`UIHostingConfiguration` / `UIHostingController`. Those SwiftUI views lean
heavily on iOS 26 Liquid Glass APIs — `.glassEffect(...)`, environment-driven
colour tokens, `@FocusState`, `@Bindable`, geometry-tracking modifiers,
implicit animations layered over auto-layout sizing.

In practice that combination keeps producing layout / keyboard / focus /
animation bugs that the SwiftUI layer cannot cleanly fix:

- Reactions overlay protrusion height jumps on first appearance and on rotation.
- `glassEffect` interacts with `clipShape` in ways that occasionally drop the
  bubble shadow or render an incorrect tint over images.
- `@FocusState` on the text field gets out of sync with the responder chain
  when the voice gesture or a sheet hands focus back to the bar.
- Keyboard avoidance hops by 1–2pt on modal dismiss because SwiftUI animates
  intrinsic size changes asynchronously to UIKit's keyboard-frame animation.
- Inline mic/camera buttons inside the SwiftUI capsule consume taps that should
  hit the text field when the user taps near the edge.
- Attachment pane's recents `LazyHStack` + `glassEffect(.rectangle)` rebuilds
  visibly when scrolled.
- Bubble `.contextMenu` was already dropped in favour of UIKit
  `UIContextMenuConfiguration`; the remaining `.contextMenu` gates inside
  `MessageBubble`/friends are dead weight.

The fix is to drop SwiftUI in the chat surface entirely and rebuild every
visible component as plain UIKit views with manual Auto Layout — the well-
trodden path used by every shipping iOS chat client (Signal, iMessage,
Telegram, the deltachat-ios reference). No `glassEffect`, no Liquid Glass
materials inside the conversation. Stock `UIVisualEffectView`, solid system
colours, `cornerRadius` with `cornerCurve = .continuous`, `UIStackView` for
layout where it earns its keep.

### Scope

In:
- Bubble cells: Text, Image+Text, File, Voice/Audio, Contact, Location, Info,
  Jumbomoji.
- Bubble decorations: sender label, quote bar, reactions row, footer
  (timestamp + edited + ephemeral + delivery state), forwarded pill, ephemeral
  stopwatch glyph.
- Chat chrome rows: date header, "New Messages" separator, "Show Older
  Messages" button, scroll-to-bottom floating button.
- Chat title view (`navigationItem.titleView`): avatar + name + presence dot.
- Banners: ephemeral-timer pill, live-location banner.
- Input bar: `(+)` attach, multiline text view, inline camera + mic, send,
  reply preview, edit pill, draft-attachment preview, voice press-and-hold +
  lock + finalise gesture.
- Attachment pane: limited-photos banner, recents strip, four type buttons
  (Photo / File / Contact / Location).

Out:
- `ChatViewModel` is untouched. Every API the new UIKit views call already
  exists on the VM.
- Sheets / modals presented from the chat view (`EmojiPickerSheet`,
  `ReactionDetailSheet`, `ChatPickerSheet`, `ContactPicker`, `LocationPicker`,
  `CameraPicker`, `ImagePreview`) stay SwiftUI for now. Their lifetime is
  short, they don't share the keyboard with the chat, and the bugs the user
  reports are about the in-chat surface — not the pickers. Future plan.
- `PHPickerViewController` / `UIDocumentPickerViewController` are already
  UIKit; no change.
- Wallpaper rendering is already UIKit (`UIImageView` + optional
  `UIVisualEffectView`); no change.
- Navigation chrome (`NavigationRouter`, `MainTabBarController`,
  `ChatListTableViewController`) is already UIKit; no change.
- 71 tests target `ChatViewModel`. No edits.

### Reference (`resources/deltachat-ios/`)

- `Chat/Views/Cells/BaseMessageCell.swift` — common avatar / sender / quote /
  body / status / reactions Auto Layout scaffolding inherited by every bubble
  subclass. `qxp` collapses avatars into the sender label (we don't show
  avatars per-bubble), but the rest of the layout stack maps 1:1.
- `Chat/Views/Cells/TextMessageCell.swift`, `ImageTextCell.swift`,
  `FileTextCell.swift`, `AudioMessageCell.swift`, `ContactCardCell.swift`,
  `InfoMessageCell.swift` — concrete cell subclasses.
- `Chat/Views/Cells/Reactions/` — reactions collection + pill cell.
- `Chat/Views/ChatInputTextView.swift` — multiline `UITextView` with
  placeholder, intrinsic content size, grow-to-N-lines via `UITextViewDelegate`.
- `Chat/Views/DraftArea.swift`, `DraftPreview.swift`, `QuotePreview.swift` —
  reply + staged-attachment preview.
- `Chat/Views/ChatEditingBar.swift` — edit-message banner.
- `Chat/Views/StatusView.swift` — delivery-state SF Symbol stack.

We mirror the Auto-Layout shape, replace MessageKit primitives with stock
UIKit (the qxp project is dependency-free), and skip parts qxp doesn't render
(WebXDC, calls, multi-select, search).

## Behavioural inventory (must preserve)

The 22 behaviours from `plans/chatview-uikit.md` Phase 1 still apply. Pasted
verbatim so this plan is self-contained:

1. Header — tappable avatar + chat name; 1:1 → push contact, group → push
   group info.
2. Optional ephemeral-timer pill above the list when `vm.ephemeralTimer > 0`.
3. Optional live-location banner above the input bar when
   `vm.isSharingLiveLocation`.
4. Optional edit pill above the input bar when editing a sent message.
5. Input bar with reply preview, draft-attachment preview, voice press-and-
   hold + lock + finalise.
6. Attachment pane (recents strip + Photo / File / Contact / Location) toggled
   by `(+)`.
7. List body — date headers, "New Messages" separator, "Show Older Messages"
   row at the visual top.
8. Per-row swipe-to-reply (UIKit-native, already in place — no regression).
9. Per-row long-press context menu — quick reactions + More + Reply + Forward
   + Copy + Edit + Delete (UIKit-native, already in place).
10. Tap quote bar → scroll to original + 700ms opacity dip.
11. Tap image → fullscreen `ImagePreview` (gallery of all photos in the chat).
12. Tap sender label → push contact.
13. Auto-scroll to bottom on new message iff user is within 80pt of bottom.
14. On open: scroll to `initialHighlightMsgId`, else `firstUnreadMessageId`,
    else bottom.
15. "New Messages" auto-clears 5s after first unread is set.
16. Forward picker → present sheet → on dismiss, if a target chat was picked,
    push it; on landing in the target, present "Forward to <name>?" alert.
17. Picker sheets (Emoji, Reaction detail, Chat, Contact, Location, Camera,
    Image preview) — stay SwiftUI; presented via `UIHostingController`.
18. Delete confirmation: "Delete for Me" + (when `canDeleteForEveryone`)
    "Delete for Everyone".
19. On disappear: persist draft, cancel any in-flight voice recording.
20. Wallpaper background — image (with scale/offset/blur) or preset (already
    UIKit + SwiftUI host for preset).
21. Bubble width caps recompute against container width on geometry change.
22. Errors via two alert paths (`vc.errorMessage` + `vm.errorMessage`).

Mark-as-seen on visible-rect (Phase 2 of the prior plan) is also already
UIKit; no regression.

## Architectural decisions

- **Cells are pure `UITableViewCell` subclasses.** `contentView` owns a
  manual auto-layout stack — no `UIHostingConfiguration`, no `UIHostingController`.
  A shared base `MessageCell` exposes `senderLabel`, `forwardedLabel`,
  `quoteView`, `bubbleContainer`, `bodyView` (subclass-supplied), `footerView`,
  `reactionsView`. Subclasses build their `bodyView` and call
  `super.configure(with:)` to drive the rest.

- **Bubble container = `UIView`, not a custom shape.** `cornerRadius = 18`,
  `cornerCurve = .continuous`. Outgoing → `accent` background (chat color
  resolved against `appearance.chatColor`). Incoming → `tertiarySystemBackground`.
  No `glassEffect`. `clipsToBounds = true` on `bubbleContainer`; the *cell's*
  `contentView.clipsToBounds = false` so the reactions overlay can hang below.

- **Reactions overlay.** Small horizontal `UIStackView` sitting at the
  bubble's bottom-trailing (incoming) or bottom-leading (outgoing) corner, with
  a 7pt overlap into the bubble. Each pill is a `UIView` with `cornerRadius = 11`,
  `secondarySystemBackground`, an inset `UILabel` for emoji + count. Self-
  reactions tint with `chatColor.withAlphaComponent(0.4)`.

- **Footer.** A horizontal `UIStackView` of: optional ephemeral SF Symbol,
  optional "edited" `UILabel`, timestamp `UILabel`, optional state SF Symbol
  (outgoing only). Same logic as `MessageFooter` in SwiftUI today; the
  formatter helpers move into `MessageFormatter` (a tiny utility struct).

- **Sender label.** Above the bubble for incoming group messages only.
  `UILabel` tinted with `senderColor`. `UITapGestureRecognizer` → push contact.

- **Quote bar.** `UIView` with a 3pt-wide left rule, sender name + quoted text
  labels, optional 36pt thumb `UIImageView`. Tap recogniser fires
  `onTapQuote(quotedMessageId)`.

- **Forwarded pill.** `UILabel` "Forwarded Message" with rounded
  `tertiarySystemBackground`. Constrained at the top of the bubble container.

- **Body.** Subclass-supplied. `TextMessageCell` uses a `UITextView` (read-
  only, transparent, with `dataDetectorTypes = [.link]` so URLs are tappable).
  `ImageTextCell` uses `UIImageView` + (optional) `UITextView` underneath.
  `FileTextCell` uses an icon + filename label + size label horizontal stack.
  `AudioMessageCell` uses a play/pause button + waveform `UIView` (a fixed
  sequence of bars driven by `vm.voicePlaybackProgress`). `ContactCardCell`
  uses an avatar + name + email vertical stack. `InfoMessageCell` is a
  centred-pill `UILabel` (capsule via `cornerRadius = labelHeight/2`).

- **Jumbomoji.** Special case of `TextMessageCell`; `configure` flips a
  `bodyKind: .text | .jumbomoji(size:)` flag that hides the `bubbleContainer`
  background and swaps the `UITextView` font to a large emoji size. Footer
  appears in a small capsule below.

- **Date / NewMessages / LoadOlder / ScrollDown / Ephemeral / LiveLocation.**
  All become `UITableViewCell` subclasses or plain `UIView` subclasses. Plain
  UIKit, no glass.

- **Title view.** `ChatTitleView: UIView` with `UIImageView` (avatar circle),
  `UILabel` (name), and a 6pt presence dot pinned bottom-trailing on the
  avatar. Single `UITapGestureRecognizer` on the whole view.

- **Input bar.** `ChatInputBarView: UIView`. Pure UIKit. Layout:
  `(+)` button | text capsule (text view + inline camera + inline mic) | send.
  The text capsule is a `UIView` with `cornerRadius = 18` and
  `secondarySystemBackground` background, hosting an `UITextView` and the two
  inline `UIButton`s at trailing edges. Text view tracks its content via
  `UITextViewDelegate.textViewDidChange` and updates `intrinsicContentSize` to
  grow up to 5 lines, then scroll.
- **Voice gesture.** `UILongPressGestureRecognizer` on the mic button:
  `.began` → start recording; `.changed` past a vertical-drag threshold →
  fire `onVoiceLock`; `.ended` (without lock) → fire `onVoiceFinalize`. While
  recording the bar swaps the text capsule for a "recording" centre with a
  red dot, elapsed timer, lock affordance, and trash button. Same state
  machine the SwiftUI version exposes through `VoiceRecordingState`; the VM
  is unchanged.
- **Reply / edit / draft / live-location stack.** A vertical `UIStackView`
  *inside* the same `inputAccessoryView` container, above the input bar:
  `[liveLocationBanner, editPill, replyPreview, draftPreview, inputBar]`.
  Each banner subview hides itself (`isHidden = true`) when its model state
  is empty.
- **Accessory container.** `ChatAccessoryView` (the existing class) loses
  the SwiftUI `accessoryHost`. It becomes a `UIView` with a single
  `UIStackView` child holding the banners + input bar. `intrinsicContentSize`
  derives from the stack's `systemLayoutSizeFitting(...)`. `autoresizingMask =
  .flexibleHeight` keeps the keyboard tracking the same way it does today.

- **Attachment pane.** `ChatAttachmentPaneView: UIView`. `UICollectionView`
  with horizontal flow layout for the recents (`thumbHeight = 120`,
  intercell spacing 8, content insets 12). Each cell is a `UIImageView`
  rounded to 8pt, async-loaded from `PHImageManager`. Below the collection,
  a horizontal `UIStackView` of four `AttachmentTypeButton` views (icon
  above label, vertical alignment, fixed 64pt width). Limited-permission
  banner is a `UIStackView` row above the collection. Background:
  `secondarySystemBackground` — no glass.

- **Live-location banner.** `LiveLocationBannerView: UIView` — small UIStack
  with an SF Symbol pulse + "Sharing live location" + "Stop" button. Stock
  `tertiarySystemBackground` rounded card.

## Phases

### Phase 1 — Cell scaffold + simple chrome rows

**Goal:** Replace the simplest UIHostingConfiguration cells with pure-UIKit
ones. After this phase: text bubbles, info messages, and every non-message
chrome row render in UIKit. Image / file / voice / contact / location bubbles
still go through SwiftUI hosting (next phase). The compose bar, attachment
pane, and chat title also remain SwiftUI (later phases). New code is gated by
a per-row routing function in `ChatViewController`, so the shell can serve
both paths during the transition.

**Steps:**

1. Create `qxp/Chat/Cells/MessageCell.swift` — abstract `UITableViewCell`
   base. Subviews + constraints described in *Architectural decisions*.
   Subclasses override `bodyView` (computed property returning a configured
   subview) and `bodyKind` (text / image / file / etc.). Provides
   `configure(with msg: MessageItem, prev: MessageItem?, isGroup: Bool,
   maxBubbleWidth: CGFloat, maxImageHeight: CGFloat, chatColor: UIColor)` and
   wires the closures (`onReact`, `onTapQuote`, `onTapImage`, …) the same
   way the SwiftUI bubble does.
2. Create `qxp/Chat/Cells/TextMessageCell.swift` — uses a transparent
   `UITextView` with `dataDetectorTypes = [.link]` and link-tap colour
   matching `chatColor` (incoming) or black (outgoing). Handles jumbomoji by
   setting `bodyKind = .jumbomoji(size:)` (hides bubble background + scales
   the font).
3. Create `qxp/Chat/Cells/InfoMessageCell.swift` — centred pill rendering
   `infoText` (the same "🔑 …" / "Tap to learn more." stripping the SwiftUI
   version does).
4. Create `qxp/Chat/Cells/DateHeaderCell.swift`, `NewMessagesCell.swift`,
   `LoadOlderCell.swift` — pure-UIKit replacements for the three SwiftUI
   chrome views in `qxp/Views/ChatChrome.swift`.
5. Create `qxp/Chat/Views/ScrollDownButton.swift` — `UIButton` subclass:
   circular `tertiarySystemBackground`, chevron SF Symbol tinted with
   `chatColor`. Replace the `UIHostingController(rootView: ScrollDownButton(...))`
   in `ChatViewController`.
6. Create `qxp/Chat/Util/MessageFormatter.swift` — lifts the timestamp /
   delivery-state / "edited" formatting logic out of `MessageBubble` /
   `MessageFooter`. Pure functions; no UIKit / SwiftUI dependency.
7. Update `ChatViewController`:
   - Register `TextMessageCell`, `InfoMessageCell`, `DateHeaderCell`,
     `NewMessagesCell`, `LoadOlderCell` for their reuse identifiers (replaces
     the generic `UITableViewCell` registration).
   - Add `private func bubbleRoute(for msg: MessageItem) -> BubbleRoute` →
     `.uikit(TextMessageCell.self)` for text/info, `.swiftUIHosted` for
     everything else (image, file, voice, contact, location, jumbomoji-with-
     image, vcard).
   - In `dataSource` cellProvider: when `.uikit`, dequeue the right cell
     class and call `configure(with: ...)`. When `.swiftUIHosted`, fall
     back to today's `UIHostingConfiguration` path.
   - Replace `scrollDownHost: UIHostingController` with the new
     `ScrollDownButton: UIButton` instance and pin it to the safe-area
     trailing/bottom constraints exactly as today.
8. Drop the SwiftUI versions of the three replaced chrome rows from
   `qxp/Views/ChatChrome.swift`. Keep `ComposeBar` (used by the accessory)
   and `EphemeralBanner` (used until Phase 2). Keep `ScrollDownButton`
   *removed*.
9. Build the project. Run the integration test suite (no edits — they target
   `ChatViewModel`).

**Outcome:** the chat displays text bubbles, info banners, date headers,
"New Messages", "Show Older Messages", and the floating scroll-down button
with zero SwiftUI involvement. Other bubble types still render via the SwiftUI
path; behaviour is unchanged.

### Phase 2 — Title view + ephemeral banner + live-location banner

**Goal:** All non-cell chrome leaves SwiftUI hosting. The
`navigationItem.titleView` becomes a UIKit view; the ephemeral pill and
live-location banner become UIKit views.

**Steps:**

1. Create `qxp/Chat/Views/ChatTitleView.swift` — `UIView` with avatar
   `UIImageView` (rounded to half-height), name `UILabel`, optional 6pt green
   dot for `peerWasSeenRecently`. Owns a `UITapGestureRecognizer` whose
   target invokes a stored closure. `configure(name:color:profileImage:
   peerWasSeenRecently:)` API.
2. Create `qxp/Chat/Views/EphemeralBannerView.swift` — top-anchored capsule
   (rounded `UIView` + SF Symbol stopwatch + "Disappearing messages: X" label).
3. Create `qxp/Chat/Views/LiveLocationBannerView.swift` — similar small card
   with a pulsating dot, label, and "Stop" button (UIButton calls
   `viewModel.stopSharingLiveLocation()`).
4. Update `ChatViewController`:
   - `titleHost: UIHostingController<AnyView>` → `titleView: ChatTitleView`.
   - `ephemeralHost: UIHostingController<AnyView>` →
     `ephemeralView: EphemeralBannerView`.
   - The accessory's SwiftUI stack still owns the live-location banner today;
     leave it in place for now. (It moves out in Phase 4 when the entire
     accessory becomes UIKit.)
5. Delete `qxp/Views/ChatTitle.swift` (which contained both `ChatTitle` and
   `EphemeralBanner`).

**Outcome:** the navigation bar's title and the top ephemeral pill render
through plain UIKit. Live-location banner is created but only wired in
Phase 4.

### Phase 3 — Image / file / voice / contact / location bubble cells

**Goal:** All bubble cells leave SwiftUI hosting. After this phase no
`UIHostingConfiguration` exists in the chat view's data source.

**Steps:**

1. Create `qxp/Chat/Cells/ImageTextCell.swift`. Body = `UIImageView` (async
   loaded off-main with `UIImage(contentsOfFile:)`) + optional `UITextView`
   for caption. Image clipped to bubble corners; aspect ratio respected via
   a width / height constraint pair driven by `imageDisplaySize` (same
   formula as today's SwiftUI). When caption is empty, footer appears as a
   small overlay capsule pinned to the image's bottom-trailing corner (mirror
   the SwiftUI behaviour).
2. Create `qxp/Chat/Cells/FileMessageCell.swift`. Body = horizontal stack:
   leading 44pt rounded square `UIImageView` (file-type SF Symbol or a tiny
   thumbnail for previewable types), trailing vertical stack of name +
   "size · mime" labels.
3. Create `qxp/Chat/Cells/VoiceMessageCell.swift`. Body = horizontal stack:
   play/pause `UIButton`, fixed-bar waveform `UIView` (40 bars driven by
   `vm.voicePlayback`), duration label. A `UISlider` is **not** used — taps
   on the waveform seek (`UITapGestureRecognizer` → translate `location.x` to
   a fraction of duration → `vm.seekVoice(...)`).
4. Create `qxp/Chat/Cells/ContactCardCell.swift`. Body = horizontal stack:
   avatar circle + vertical stack (display name + email). Tap opens the
   contact (the existing `onPickContact` callback path).
5. Create `qxp/Chat/Cells/LocationCell.swift`. Body = `MKMapView` snapshot
   (`MKMapSnapshotter`) rendered into a `UIImageView` so the cell stays
   reuse-friendly; map-view-per-cell would cost too much. A small label
   overlay shows "Live location · X min ago" when the location is shared.
6. Update `ChatViewController.bubbleRoute(for:)` to return `.uikit` for
   every viewType. Delete the `.swiftUIHosted` branch from `cellProvider`.
7. Update `MessageCell.configure` to forward all callbacks (`onTapImage`,
   `onTapContact`, etc.) the same way the SwiftUI `MessageBubble` does.
8. Delete `qxp/Views/MessageBubble.swift`, `FileBubble.swift`,
   `VoiceBubble.swift`, `LocationBubble.swift`, `ContactBubble.swift`,
   `BubbleImage` (now inlined into `ImageTextCell`). Keep
   `MessageFormatter.swift` for the formatting helpers it absorbed in Phase 1.

**Outcome:** every bubble cell is pure UIKit. No `glassEffect` anywhere in
the chat list. The `BubbleShape` SwiftUI helper, the `bubbleForeground` /
`bubbleSecondary` `EnvironmentValues`, and the `ChatColorEnvironmentKey`
are all dead — they get removed in Phase 6.

### Phase 4 — Input bar + reply / edit / draft preview

**Goal:** Replace the SwiftUI `MessageInputBar`, `ComposeBar`, `DraftPreview`,
reply preview, and live-location banner inside the accessory with a plain
UIKit accessory hierarchy. After this phase the `inputAccessoryView` contains
zero SwiftUI views.

**Steps:**

1. Create `qxp/Chat/Views/ChatInputTextView.swift` — `UITextView` subclass
   with a placeholder label, `intrinsicContentSize` capped at 5 line heights,
   and a `textDidChange` callback.
2. Create `qxp/Chat/Views/ChatInputBarView.swift` — `UIView` with the
   `(+)` button, the `ChatInputTextView`-bearing capsule, the inline mic +
   camera buttons, and the send button. Voice gesture: long-press recogniser
   on the mic button + `UIPanGestureRecognizer` bridged from the mic button
   to detect the upward drag for lock. State machine:
   - `.began` → `onVoicePressStart()`
   - `.changed` past `-40pt` translation → `onVoiceLock()` and swap the
     view into "locked" mode (red dot, timer, trash, send-as-voice).
   - `.ended` without lock → `onVoiceFinalize()` (or `onVoiceCancel` if the
     drag was sideways past the trash threshold).
   The view exposes `text: String`, `attachment: DraftAttachment?`,
   `replyMessage: MessageItem?`, `editingMessage: MessageItem?` properties
   the VC sets directly.
3. Create `qxp/Chat/Views/ChatReplyPreviewView.swift`,
   `ChatDraftPreviewView.swift`, `ChatEditingBarView.swift` — small UIKit
   banners for the three above-bar states. Each subscribes-via-callback to a
   single VC method (cancel / clear / send-edit).
4. Replace `ChatAccessoryView` internals (today: hosts a SwiftUI
   `ChatAccessoryContent`). New shape:
   - Single `UIStackView` (axis = vertical, distribution = .fill) holding
     `[liveLocationBanner, editingBar, replyPreview, draftPreview, inputBar]`.
   - Each child has `isHidden = true` when its underlying VM state is empty;
     toggled by `ChatViewController.refreshAccessory()`.
   - `intrinsicContentSize` derives from `stackView.systemLayoutSizeFitting(...)`
     so the keyboard tracking the bar continues to work.
5. Move the live-location banner created in Phase 2 into the accessory
   stack. Drop its top-anchored mounting from `ChatViewController.setupHierarchy()`.
6. Delete the SwiftUI `accessoryHost` and `ChatAccessoryContent` from
   `ChatViewController`. Replace `customAccessoryView` instantiation with a
   direct `ChatAccessoryView` containing the new UIKit stack.
7. Delete `qxp/Views/MessageInputBar.swift`, `qxp/Views/ComposeView.swift`,
   `qxp/Views/DraftPreview.swift`, `qxp/Views/LiveLocationBanner.swift`, and
   the `ComposeBar` view inside `qxp/Views/ChatChrome.swift`.

**Outcome:** the compose surface is pure UIKit. Keyboard avoidance, focus
handling, and voice gesture all run on the responder chain — no `@FocusState`
mismatches. The `ChatAccessoryContent` SwiftUI struct is gone.

### Phase 5 — Attachment pane

**Goal:** Replace the SwiftUI `AttachmentPane` with a pure-UIKit pane.

**Steps:**

1. Create `qxp/Chat/Views/ChatAttachmentPaneView.swift` — `UIView` with:
   - Optional `LimitedAccessBannerView` (icon + label + "Manage" button) at
     the top.
   - `UICollectionView` (horizontal flow layout) loading `PHAsset`s through
     `PHCachingImageManager.requestImage(for:targetSize:contentMode:)`. Cell
     class `RecentPhotoCell` with a single `UIImageView` and a 12pt
     rounded background. Limit 96 assets, mirror the SwiftUI fetch options.
   - Horizontal `UIStackView` of four `AttachmentTypeButton`s (Photo / File
     / Contact / Location). Each is a vertical stack: SF Symbol icon (28pt,
     accent-tinted) + caption label. `UIControl.sendActions(for: .touchUpInside)`
     wired to closures the VC sets.
2. Hide / show via `paneOpen` boolean toggled by the `(+)` button. The pane
   slides up under the input bar — implementation: insert into the same
   accessory `UIStackView` from Phase 4 (above the input bar) with
   `isHidden`-driven animation; the keyboard auto-dismisses when the pane
   opens (mirrors today's behaviour).
3. Delete `qxp/Views/AttachmentPane.swift`.

**Outcome:** the attachment pane is pure UIKit. The recents grid no longer
flickers on scroll because `UICollectionView` reuses cells through
`PHCachingImageManager` rather than rebuilding `LazyHStack` rows.

### Phase 6 — Cleanup, dead-code sweep, regression sweep

**Goal:** Remove every SwiftUI view that no longer has a caller; verify
behaviours 1–22 manually; run the test suite.

**Steps:**

1. Grep for the SwiftUI types that this plan removes. Anything still
   referenced gets either inlined into its remaining caller or deleted.
   Concretely: `BubbleShape`, `bubbleForeground` / `bubbleSecondary`
   `EnvironmentValues`, `ChatColorEnvironmentKey` (only if no other view uses
   it; the chat-list row likely still does — check before deleting), the
   private `chatTitle` / `EphemeralBanner` / `ScrollDownButton` / `LoadOlderButton`
   structs in `ChatChrome.swift` / `ChatTitle.swift`.
2. Verify no `glassEffect` modifier calls remain in any chat-path file
   (`qxp/Chat/**`, `qxp/Navigation/ChatViewController.swift`).
3. Run the integration suite (the user runs it on Mac; this machine can't
   build).
4. Manual verification on device — same checklist as
   `plans/chatview-uikit.md` Phase 3, plus:
   - Voice gesture: press → start, drag up → lock, release-without-lock →
     finalise, drag sideways → cancel/trash. Compare against deltachat-ios.
   - Keyboard: open chat with the keyboard already up from a prior chat;
     dismiss; tap reply on a bubble; tap edit on an outgoing bubble; tap
     `(+)`. Expect no 1–2pt jumps on any of those transitions.
   - Reactions overlay sits flush with the bubble bottom corner on first
     paint, not on the second pass.
   - Image bubble: tap → fullscreen preview; pinch / dismiss; back to chat
     with no layout shift.
5. Archive `PLAN.md` → `plans/chatview-uikit-rewrite.md`. Update the *Active
   plan* bullet in `CLAUDE.md` and `AGENTS.md`. Reset `PLAN.md` to empty.

**Outcome:** the chat surface is pure UIKit. SwiftUI is confined to the
modal sheets that present from it.

## Files

### New (≈ 18 files)

```
qxp/Chat/Cells/MessageCell.swift                  (Phase 1, abstract base)
qxp/Chat/Cells/TextMessageCell.swift              (Phase 1)
qxp/Chat/Cells/InfoMessageCell.swift              (Phase 1)
qxp/Chat/Cells/DateHeaderCell.swift               (Phase 1)
qxp/Chat/Cells/NewMessagesCell.swift              (Phase 1)
qxp/Chat/Cells/LoadOlderCell.swift                (Phase 1)
qxp/Chat/Cells/ImageTextCell.swift                (Phase 3)
qxp/Chat/Cells/FileMessageCell.swift              (Phase 3)
qxp/Chat/Cells/VoiceMessageCell.swift             (Phase 3)
qxp/Chat/Cells/ContactCardCell.swift              (Phase 3)
qxp/Chat/Cells/LocationCell.swift                 (Phase 3)
qxp/Chat/Views/ScrollDownButton.swift             (Phase 1, replaces SwiftUI)
qxp/Chat/Views/ChatTitleView.swift                (Phase 2)
qxp/Chat/Views/EphemeralBannerView.swift          (Phase 2)
qxp/Chat/Views/LiveLocationBannerView.swift       (Phase 2 / 4)
qxp/Chat/Views/ChatInputTextView.swift            (Phase 4)
qxp/Chat/Views/ChatInputBarView.swift             (Phase 4)
qxp/Chat/Views/ChatReplyPreviewView.swift         (Phase 4)
qxp/Chat/Views/ChatDraftPreviewView.swift         (Phase 4)
qxp/Chat/Views/ChatEditingBarView.swift           (Phase 4)
qxp/Chat/Views/ChatAttachmentPaneView.swift       (Phase 5)
qxp/Chat/Util/MessageFormatter.swift              (Phase 1, formatting helpers)
```

### Modified

```
qxp/Navigation/ChatViewController.swift           (every phase)
qxp/Views/ChatChrome.swift                        (shrink each phase, finally delete)
```

### Deleted

```
qxp/Views/MessageBubble.swift                     (Phase 3)
qxp/Views/FileBubble.swift                        (Phase 3)
qxp/Views/VoiceBubble.swift                       (Phase 3)
qxp/Views/LocationBubble.swift                    (Phase 3)
qxp/Views/ContactBubble.swift                     (Phase 3)
qxp/Views/MessageInputBar.swift                   (Phase 4)
qxp/Views/ComposeView.swift                       (Phase 4)
qxp/Views/DraftPreview.swift                      (Phase 4)
qxp/Views/LiveLocationBanner.swift                (Phase 4)
qxp/Views/AttachmentPane.swift                    (Phase 5)
qxp/Views/ChatTitle.swift                         (Phase 2)
qxp/Views/ChatChrome.swift                        (Phase 6 — only if empty)
```

## Open questions / deferred

- **Sheet replacements.** `EmojiPickerSheet`, `ReactionDetailSheet`,
  `ChatPickerSheet`, `ContactPicker`, `LocationPicker`, `CameraPicker`,
  `ImagePreview` stay SwiftUI. Worth a future plan only if the modal-host
  layer also leaks bugs (so far it doesn't).
- **In-chat search.** Reference has it (`ChatSearchAccessoryBar`); qxp
  doesn't. Future plan, fits naturally on the new UIKit shell.
- **Multi-select / bulk forward / bulk delete.** Reference has it. Future
  plan.
- **Drag-and-drop attachments** via `UITableViewDropDelegate`. Future plan.
- **Per-chat font scaling / dynamic-type.** The new UITextView body uses
  `UIFont.preferredFont(forTextStyle: .body)` so the system handles it.
  Verify before declaring done in Phase 6.
- **Map cell live updates.** Phase 3 ships a snapshotter-based
  `LocationCell`. If the user wants the dot to move while live-location is
  active, swap to a real `MKMapView` per cell — but only after profiling on
  device confirms the cost is acceptable.
- **`ChatColorEnvironmentKey` lifetime.** It's used by chat-list row and
  possibly other surfaces. Phase 6 only deletes it if no callers remain.
- **`BubbleShape` lifetime.** The custom-tail-corner bubble shape from the
  SwiftUI version disappears in Phase 3. The UIKit cells use a uniform 18pt
  rounded rectangle. If the user wants the asymmetric tail back later, it
  fits as a small `CAShapeLayer`-backed mask on `bubbleContainer`.
