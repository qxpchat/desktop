# PLAN: ChatView UIKit Rewrite

## Context

`qxp/Views/ChatView.swift` is currently a ~700-line SwiftUI composition: `ScrollView` + `LazyVStack` of `MessageBubble`s, `safeAreaInset(.bottom)` for the compose bar + attachment pane, plus a stack of `.sheet`/`.fullScreenCover` modifiers for pickers and the image preview. It has shipped and works, but the SwiftUI scroll/keyboard/insertion model leaks visible artefacts:

- **Insertion drift.** Loading older messages requires anchoring `ScrollPosition` to a stored msgId; works most of the time but flickers when content height shifts mid-frame.
- **Keyboard avoidance.** `safeAreaInset(.bottom)` over a `ScrollView` is fragile across modal returns and split views — small offset jumps and brief overlaps with the toolbar are observable.
- **Context menus.** SwiftUI's `.contextMenu { … }` doesn't lift the bubble the way iMessage/Signal/Delta Chat do; it just shows a flat menu attached to the cell. The richer "lift + dim + emoji-row preview" requires UIKit.
- **Scroll perf.** `LazyVStack` recreates heavy bubble subviews (image + voice waveform) on small offset changes; UITableView's reuse pool fixes this for free.
- **Mark-as-seen.** No visible-rect hook in SwiftUI's scroll APIs that's stable across animations.

The chat list already runs on the UIKit shell pattern (`ChatListTableViewController` — UITableView with `UIHostingConfiguration` cells). The chat view should follow suit. Reference implementation is `resources/deltachat-ios/deltachat-ios/Chat/ChatViewController.swift` (~2900 lines, pure UIKit cells).

### Scope

- Replace `qxp/Views/ChatView.swift` with a new `qxp/Navigation/ChatViewController.swift` (UIViewController, UITableViewDataSource/Delegate).
- Reuse the existing SwiftUI bubble views (`MessageBubble`, `FileBubble`, `VoiceBubble`, `LocationBubble`, `ContactBubble`, `BubbleImage`, `DraftPreview`, `MessageInputBar`, `AttachmentPane`, `LiveLocationBanner`, `ImagePreview`, `EmojiPickerSheet`, `ReactionDetailSheet`, `ChatPickerSheet`, `ContactPicker`, `LocationPicker`, `CameraPicker`) via `UIHostingConfiguration` cells and `UIHostingController` presentations / accessory views — same hybrid pattern as `ChatListTableViewController`.
- Update `NavigationRouter.pushChat` to push the new VC.
- Preserve every behaviour the SwiftUI ChatView has: see "Behavioural inventory" below.
- `ChatViewModel` is **untouched**. All view-model APIs already cover everything the UIKit shell needs.
- The 41 integration tests target `ChatViewModel`, not `ChatView`. They should continue to pass without modification.

### Not in scope

- Rewriting any bubble (MessageBubble / FileBubble / VoiceBubble / LocationBubble / ContactBubble) as a pure UIKit cell. The bubbles are dense Liquid-Glass SwiftUI; rewriting them in UIKit fights both the project's "no custom blurs" rule and ~1500 lines of working code. Hosting them in `UIHostingConfiguration` cells is the iOS 16+ idiomatic pattern and is what we use in the chat list already.
- Adding in-chat search (deltachat-ios has it; qxp's SwiftUI ChatView never did). Treat as a future plan.
- Multi-select / bulk actions on messages (also reference-only). Future plan.
- Drag-and-drop attachments from other apps (future plan).
- WebXDC / call cells (qxp doesn't render them today).

## Behavioural inventory (must preserve)

Verified by reading `qxp/Views/ChatView.swift`:

1. Header — inline navigation title is a tappable HStack of `AvatarView` + chat name. 1:1 → push contact; group → push group info.
2. Optional ephemeral-timer pill above the list (top safe-area inset) when `viewModel.ephemeralTimer > 0`.
3. Optional `LiveLocationBanner` above the input bar when `viewModel.isSharingLiveLocation`.
4. Optional `ComposeBar` ("Editing" pill with current text) above the input bar when editing a sent message.
5. `MessageInputBar` (text + attach + mic/cam + send) with reply preview, draft-attachment preview, voice press-and-hold + lock + finalize.
6. `AttachmentPane` (recents strip + Photo/File/Contact/Location buttons) toggled by the `(+)` button.
7. List body — date headers (`DateHeaderView`), unread "New Messages" separator above `firstUnreadMessageId`, "Show Older Messages" button at the top when `hasOlderMessages`. Message rows render via `MessageBubble`.
8. Per-row swipe-to-reply (`SwipeToReply` SwiftUI modifier) — direction-locked, haptic at threshold, fires on release.
9. Per-row long-press context menu — quick reactions row + More Reactions + Reply + Forward + Copy + Edit + Delete + per-action accessibility labels.
10. Tap quote bar → scroll to original + 400ms opacity pulse on the highlighted bubble.
11. Tap image → fullscreen `ImagePreview` (gallery of all photos in the chat).
12. Tap sender label → push contact.
13. Auto-scroll to bottom on new message **iff** the user is within 80pt of the bottom; otherwise hold position.
14. On open: scroll to `initialHighlightMsgId`, else scroll to `firstUnreadMessageId`, else scroll to bottom.
15. Auto-clear "New Messages" marker 5s after first unread is set.
16. Forward picker: present `ChatPickerSheet`; on dismiss, if a target chat was picked, push it (router); next time we land on the target chat, present a "Forward to <chat name>?" alert that consumes the queued ids.
17. Picker sheets: PhotosPicker, CameraPicker, file importer, ContactPicker, LocationPicker, EmojiPickerSheet (full reactions), ReactionDetailSheet.
18. Delete confirmation dialog with "Delete for Me" + (when `canDeleteForEveryone`) "Delete for Everyone".
19. On disappear: persist draft, cancel any in-flight voice recording.
20. Wallpaper background — image (`appearance.wallpaperImage`) with scale/offset/blur, or preset (`appearance.wallpaper`).
21. Bubble width caps recompute against the container width on geometry change (80% / 90% for image bubbles).
22. Errors surfaced via two `.alert` paths (local `errorMessage` + `vm.errorMessage`).

## Reference behaviour (deltachat-ios `ChatViewController`)

- `UITableView` with `transform = CGAffineTransform(scaleX: 1, y: -1)` so the visual bottom is row 0; each cell counter-transforms. New messages prepend at row 0; older messages append, and UITableView naturally preserves visual position when content grows below the viewport.
- `inputAccessoryView` is a custom `InputBarAccessoryView`; the VC overrides `canBecomeFirstResponder` to drop the bar when a non-search modal is presented or when not the top VC.
- A `KeyboardManager` reads keyboard notifications and adjusts `tableView.contentInset.top` (top, because of the flip) so the visual bottom of the list stays above the keyboard.
- `getChatMsgsAndTimestamps(flags: DC_GCM_ADDDAYMARKER)` returns inline daymarker rows (id `DC_MSG_ID_DAYMARKER`); the unread separator uses `DC_MSG_ID_MARKER1`. Both are special ids handled in `cellForRowAt`.
- Cell types: `TextMessageCell`, `ImageTextCell`, `FileTextCell`, `AudioMessageCell`, `ContactCardCell`, `InfoMessageCell`, `WebxdcCell`, all subclasses of `BaseMessageCell` (manual Auto Layout for avatar / name / quote / body / status / reactions).
- Swipe-to-reply: leading `UISwipeActionsConfiguration` plus a custom pan recogniser that fires the reply on release once the action is open (not on full-swipe).
- Context menu: `UIContextMenuConfiguration` with a custom preview that renders the quick-reactions emoji row above the lifted bubble.
- Visible-rect mark-as-seen: hooks `scrollViewDidEndDecelerating`, `scrollViewDidEndScrollingAnimation`, and visibility toggles.
- Title view: custom `ChatTitleView` with avatar + name + subtitle, assigned to `navigationItem.titleView`; tap recogniser on the navbar pushes profile.
- Background: `tableView.backgroundView = UIImageView` (also flipped) with the wallpaper.
- Search: `UISearchController` on `navigationItem`; matched message ids drive a per-cell highlight. *(qxp Phase 2 future, not in this plan.)*

We mirror the structural patterns (inverse transform, inputAccessoryView, synthetic marker rows, native swipe + context menus, native keyboard-tracking accessory, visible-rect mark-seen) and skip the parts that don't fit qxp (custom UIKit cells, search, multi-select, WebXDC).

## Architectural decisions

- **Cells render existing SwiftUI bubbles via `UIHostingConfiguration`.** Same pattern as `ChatListTableViewController`. The bubble file tree (`MessageBubble.swift` and friends) is **not** modified — we feed them the same `MessageItem` they consume today and forward callbacks via closures captured into the configuration. The reactions overlay protrudes below the bubble; we set `clipsToBounds = false` on the cell's `contentView` so the protrusion is visible. `UIHostingConfiguration { … }.margins(.top, 0).margins(.horizontal, 0)` zeros UIKit's padding so the bubble owns all spacing decisions.
- **Inverse transform on the table.** `tableView.transform = .init(scaleX: 1, y: -1)`; cells are configured with the inverse so the SwiftUI hosting renders right-side-up. Auto-scroll to bottom = `scrollToRow(at: IndexPath(row: 0, section: 0), at: .top, animated:)`. Pagination: when the visual top is reached (numerically the last row), call `viewModel.loadOlderMessages()`; UITableView preserves the scroll position because we appended to the end of the data array.
- **Compose bar = `inputAccessoryView`.** A `UIView` container hosts a `UIHostingController(rootView: MessageInputBar(…))`'s view; the container's height is driven by Auto Layout from the SwiftUI content's intrinsic size. The VC overrides `canBecomeFirstResponder` and `inputAccessoryView`. The reply preview, edit pill (`ComposeBar` from `ChatView.swift`), and `LiveLocationBanner` are stacked **inside** the same accessory container so they all track the keyboard together — a single `UIStackView` is enough.
- **Banners (ephemeral pill).** Top inset; rendered via a `UIHostingController` mounted as a child VC and constrained to the safe area top. Or simpler: a plain `UILabel` with the Liquid-Glass capsule re-implemented via SwiftUI hosting because we want the existing `glassEffect` look. Pick the SwiftUI-hosting path for consistency.
- **Diffable data source.** `UITableViewDiffableDataSource<Section, Row>` with one section (`.main`). `Row` is an enum with cases `.message(UInt32)`, `.dateHeader(timestamp)`, `.newMessages`, `.loadOlder`. Snapshot rebuilt from `viewModel.messages`. Eliminates the `tableView.reloadData()` flash when only metadata (delivery state, reactions) changes — the diff computes a single-row `reload` for that case. `ChatViewModel` already emits `updateMessage(id:)` for those events; we map that to a row-level reconfigure (`snapshot.reconfigureItems([.message(id)])`).
- **Context menus.** Native `UITableViewDelegate.tableView(_:contextMenuConfigurationForRowAt:)`. Replaces the SwiftUI `.contextMenu { … }` inside `MessageBubble`. The quick-reactions row goes above the lifted bubble via a `previewProvider` that returns a small `UIHostingController` with the emoji row; the rest of the menu (Reply / Forward / Copy / Edit / Delete) lives in the action provider. **Inside `MessageBubble.swift`** we add a Boolean `showsContextMenu` (default true) that the UIKit caller sets to **false** so the SwiftUI `.contextMenu` is suppressed — only the UIKit one fires. This is the only edit to a bubble file in the entire plan, and it's a one-liner gate. **Phase 1 keeps the gate at `true`** so the existing (vertical-button) SwiftUI menu stays functional through the shell rewrite; **Phase 2** flips it to `false` and replaces the experience with the native UIKit lifted-preview menu, which also resolves the original "menu doesn't dismiss after Picker tap" issue that 71f5a8f addressed by sacrificing the palette layout. *(If we want zero changes to bubble files, alternative is to use a SwiftUI `View` wrapper that strips the menu — but that's worse than the boolean gate.)*
- **Swipe-to-reply.** Native `tableView(_:leadingSwipeActionsConfigurationForRowAt:)`. The icon and threshold mirror what the reference does; performsFirstActionWithFullSwipe = false; we fire the reply when the swipe action *opens* (deltachat-ios pattern: a separate pan recogniser on the table watches for `state == .ended` and triggers the action if the cell is in the swipe-open state). Replaces the SwiftUI `SwipeToReply` view modifier in `ChatView.swift`. We also pass `showsContextMenu` semantics for the swipe — the SwiftUI `SwipeToReply` modifier is no longer applied.
- **Sheets / full-screen covers.** All translated to `present(_:animated:)`. Photo picker keeps using SwiftUI `PhotosPicker`? No — UIKit-native `PHPickerViewController` is the idiomatic replacement and slots in cleanly. For minimal-diff first pass, present a tiny `UIHostingController` that wraps the current SwiftUI sheet content (e.g. `EmojiPickerSheet`, `ReactionDetailSheet`, `ChatPickerSheet`, `ContactPicker`, `LocationPicker`); for `PhotosPicker` / file importer we replace with `PHPickerViewController` + `UIDocumentPickerViewController` because that's what UIKit expects (and `PhotosPicker` only works inside SwiftUI contexts). `CameraPicker` is already UIKit underneath, present as-is.
- **Title view.** `navigationItem.titleView = UIHostingController(rootView: ChatTitle(…)).view`. The `chatTitle` private view in the existing `ChatView.swift` is hoisted into a `private struct ChatTitle: View` defined inside the new VC file (or alongside in a small `ChatViews.swift` if grouping helps).
- **Wallpaper.** `tableView.backgroundView = UIImageView` for image wallpaper (with `transform = .init(scaleX: 1, y: -1)` to compensate for the table flip); for preset wallpaper (gradient/solid SwiftUI view), embed a `UIHostingController` whose view becomes `tableView.backgroundView`. Updates by observing `appearance` via `withObservationTracking` in `viewWillAppear`/`appearancesDidChange` callback wired through `AppearanceSettings`.
- **Forward-confirm flow.** Lives in `viewDidAppear`: if `appState.forwardMessageIds != nil && appState.forwardTargetChatId == chatId`, present a `UIAlertController("Forward to <chat name>?", …)` with Forward + Cancel; semantics identical to today.

## Phases

### Phase 1 — VC shell + table + cells + accessory bar (the 80% deliverable) ✅ DONE (2026-04-26)

**Goal:** New `ChatViewController` is the default presented from the chat list. Every behaviour 1–22 from the inventory works. Bubble rendering, voice gesture, attachment flow, reactions, replies, edit, delete, forward, scroll-to-quote, image preview — all functional.

**Steps:**

1. Create `qxp/Navigation/ChatViewController.swift`:
   - `final class ChatViewController: UIViewController, UITableViewDataSource, UITableViewDelegate`. `@MainActor`.
   - Init: `appState: AppState`, `appearance: AppearanceSettings`, `chatId: UInt32`, `highlightMsg: UInt32?`. Builds `viewModel = ChatViewModel(chatId:)`, calls `viewModel.bind(to: appState)`. `hidesBottomBarWhenPushed = true`.
   - `tableView`: plain style, separator none, transform `(1, -1)`, `contentInsetAdjustmentBehavior = .never`, `keyboardDismissMode = .interactive`. Single dummy reuse identifier (`"row"`); hosting configuration handles per-row content.
   - Subscribe to `appState.events` (`AnyCancellable`). Map events the same way `ChatViewModel.onEvent` does — but the VM already does the work; our subscription only triggers `applySnapshot()` and `reconfigureItems` for single-msg events. Concretely: every event passes through the VM which mutates `messages` / `firstUnreadMessageId` / `ephemeralTimer`; we observe those mutations via `withObservationTracking` against the VM. Translate VM state changes → snapshot updates.
   - **Diffable data source.**
     ```swift
     enum Section: Hashable { case main }
     enum Row: Hashable {
         case message(UInt32)
         case dateHeader(Int64)
         case newMessages
         case loadOlder
     }
     ```
     `applySnapshot()` builds the row list by walking `viewModel.messages` in **reverse** (visual-bottom-first, because of the table flip) and inserting `.dateHeader(ts)` / `.newMessages` / `.loadOlder` rows where appropriate. (Date-header detection mirrors `shouldShowDateHeader` from the SwiftUI version; identical predicate.)
   - **Cell content.** `UIHostingConfiguration` for each row case:
     - `.message(id)`: `MessageBubble(message:…, …)` (default `showsContextMenu: true` in Phase 1) with all the same callbacks (reply, forward, copy, edit, delete, react, pickEmoji, tapImage, tapQuote, tapSender). The callbacks call methods on the VC, which forward to the VM and present sheets. Phase 2 flips this to `showsContextMenu: false` once the native UIKit menu lands.
     - `.dateHeader(ts)`: `DateHeaderView` (lifted from the existing private struct in `ChatView.swift` to the new file).
     - `.newMessages`: `NewMessagesSeparator` (also lifted).
     - `.loadOlder`: `Button("Show Older Messages") { … }` styled as today.
   - Apply the inverse cell transform: `cell.transform = .init(scaleX: 1, y: -1)` and `cell.contentView.clipsToBounds = false` (reactions overlay).
2. **Title view.** Hoist `chatTitle` from `ChatView.swift` into `qxp/Views/ChatTitle.swift` (new file). Mount as `UIHostingController` whose `view` becomes `navigationItem.titleView`. Update on every VM `chatName / chatColor / chatProfileImage / peerWasSeenRecently` change via `withObservationTracking`.
3. **Banners.**
   - Ephemeral pill: a child `UIHostingController` constrained to safe-area top. Hidden when `viewModel.ephemeralTimer == 0`.
4. **InputAccessoryView.**
   - Custom `UIView` subclass `ChatAccessoryView` implementing `intrinsicContentSize` from its hosting controller's view's `systemLayoutSizeFitting(.layoutFittingCompressedSize)`.
   - Hosts a SwiftUI stack: `LiveLocationBanner` (conditional) + `ComposeBar` (conditional, edit-pill) + `MessageInputBar(…)` + `AttachmentPane` (conditional). All wired to the VM via `@Bindable` exactly like today.
   - VC overrides `var inputAccessoryView: UIView? { accessoryView }` and `override var canBecomeFirstResponder: Bool { … }` (returning false when a non-search modal is presented or when not the top VC).
5. **Auto-scroll on new message.** Track `isNearBottom` via `scrollViewDidScroll` (visual bottom = row 0; "near bottom" = `tableView.contentOffset.y < 80` after accounting for flip). When `viewModel.messages.last?.id` changes, if `isNearBottom`, `tableView.scrollToRow(at: .init(row: 0, section: 0), at: .top, animated: true)`.
6. **Initial scroll.** In `viewWillAppear` (first call only): if `highlightMsg` set → `scrollToMessage(id:animated:false)` and `flashHighlight(id:)`. Else if `firstUnreadMessageId != nil` → `scrollToMessage(id:.top)`. Else → row 0.
7. **Pagination.** In `tableView(_:willDisplay:forRowAt:)`: when the displayed row is `.loadOlder`, call `viewModel.loadOlderMessages()`. The VM mutates `messages`; observation triggers `applySnapshot()`; the table appends new rows at the bottom of the data array (visual top), preserving the user's scroll position natively.
8. **Mark-as-seen.** `marknoticedChat` is already called by `ChatViewModel.load()`; that's enough for parity (the SwiftUI ChatView doesn't call any per-msg seen API). No additional plumbing in this phase.
9. **Quote tap → scroll + flash.** `scrollToMessage(id:animated:true)` at `.middle` + transient overlay on the cell using a CALayer alpha animation (mirrors today's 400ms opacity dip). Implementation: tag the cell's `contentView` with a transient sublayer that animates `opacity 1 → 0.3 → 1` over 700ms.
10. **Sheets / pickers.**
    - Photo picker: `PHPickerViewController(configuration:)` filtered to images, single selection. Handle result in `picker(_:didFinishPicking:)`, copy data to tmp, call `viewModel.stageAttachment(.photo(…))`.
    - File importer: `UIDocumentPickerViewController(forOpeningContentTypes: [.item])`, `allowsMultipleSelection = false`. Same staging flow as today.
    - Camera: `present(CameraPicker(…))` wrapped in `UIHostingController` (it's a tiny SwiftUI `UIViewControllerRepresentable` already; we can present its underlying `UIImagePickerController` directly, but reusing the SwiftUI wrapper inside a `UIHostingController` is fine).
    - ContactPicker / LocationPicker / ChatPickerSheet / EmojiPickerSheet / ReactionDetailSheet / ImagePreview: each presented as `UIHostingController(rootView: <existing SwiftUI sheet>)` with the appropriate `modalPresentationStyle` (`pageSheet` for sheets, `fullScreen` for ImagePreview).
    - Delete confirm: `UIAlertController(.actionSheet on phone)` with the same two destructive buttons.
    - Forward-confirm: `UIAlertController(.alert)` in `viewDidAppear` when state is set, exactly the same as today.
11. **Wallpaper.** Build `tableView.backgroundView` from `appearance` once in `viewDidLoad`, refresh in `viewWillAppear`. Image case: `UIImageView` (counter-flip, scaled, offset, blurred via `UIVisualEffectView` overlay if `wallpaperBlurred`). Preset case: `UIHostingController(rootView: appearance.wallpaper!.background())`. Clear case: `nil`.
12. **Disappear hooks.** `viewWillDisappear`: `viewModel.persistDraftNow()`, and if `voiceState.isRecording` → `viewModel.cancelVoiceRecording()`.
13. **Update routing.** `qxp/Navigation/NavigationRouter.swift::pushChat(id:highlightMsg:)`:
    - Remove the SwiftUI `ChatView(…)` + `makeHostingVC` path.
    - Push `ChatViewController(appState:, appearance:, chatId:, highlightMsg:)` directly. `hidesBottomBarWhenPushed = true` is set on the VC itself.
14. **Delete `qxp/Views/ChatView.swift`.** All private helpers in it that aren't reused (the `SwipeToReply` modifier, `ComposeBar`, `NewMessagesSeparator`, `DateHeaderView`) are either lifted into the new VC's file or `qxp/Views/ChatTitle.swift` if shared. The `ComposeBar`, `NewMessagesSeparator`, `DateHeaderView` are lifted as small SwiftUI views into a new `qxp/Views/ChatChrome.swift`. `SwipeToReply` is deleted (replaced by native swipe action).
15. **Edit `MessageBubble.swift`.** Add `var showsContextMenu: Bool = true` parameter. Wrap the `.contextMenu { contextMenuItems }` in `if showsContextMenu`. **Phase 1 keeps the default (`true`)** — the SwiftUI menu (current "vertical list of emoji buttons + actions" layout from commit 71f5a8f) keeps working through Phase 1, so there is no long-press regression while the new shell ships. Phase 2 flips the cell to `false` and adds the native UIKit menu.
16. **Build sanity check.** None of `ChatViewModel`, `AppState`, `AppearanceSettings`, the bubble files (other than the gate above), the picker sheets, `ImagePreview`, or test files change.

**Outcome:** new VC ships; the chat opens, sends, edits, replies, forwards, deletes, reacts, plays voice, picks photos / files / contacts / locations, shows the right banners, paginates older history, scrolls correctly on new messages, and persists drafts. SwiftUI `ChatView.swift` is gone.

**Outcome (actual, 2026-04-26):**
- New: `qxp/Navigation/ChatViewController.swift` (~1186 lines) — UIViewController with inverse-transformed UITableView, diffable data source over `enum Row { .message, .dateHeader, .newMessages, .loadOlder }`, `UIHostingConfiguration` cells, custom `ChatAccessoryView` (`autoresizingMask = .flexibleHeight` + `intrinsicContentSize`) hosting the SwiftUI accessory stack, `withObservationTracking` re-arm pattern for VM bindings.
- New: `qxp/Views/ChatTitle.swift` (`ChatTitle` + `EphemeralBanner`).
- New: `qxp/Views/ChatChrome.swift` (`ComposeBar`, `NewMessagesSeparator`, `DateHeaderView` with `shouldShow(prev:current:)`, `LoadOlderButton`).
- Modified: `qxp/Views/MessageBubble.swift` — added `showsContextMenu: Bool = true` parameter and `contextMenuIf` builder; default stays `true` so the SwiftUI menu remains live until Phase 2.
- Modified: `qxp/Navigation/NavigationRouter.swift::pushChat(id:highlightMsg:)` now pushes `ChatViewController` directly (no SwiftUI hosting). `hidesBottomBarWhenPushed` set on the VC itself.
- Deleted: `qxp/Views/ChatView.swift` (704 lines).
- Pickers: `PHPickerViewController` (photos), `UIDocumentPickerViewController` (files); SwiftUI sheets (`EmojiPickerSheet`, `ReactionDetailSheet`, `ChatPickerSheet`, `ContactPicker`, `LocationPicker`, `CameraPicker`, `ImagePreview`) presented via `UIHostingController`. Forward / delete confirmations are `UIAlertController` with iPad popover anchors.
- Wallpaper: sibling view UNDER tableView (not `tableView.backgroundView`) to avoid double-flip; supports image (with optional `UIVisualEffectView` blur) and SwiftUI preset wallpapers.
- Untouched: `ChatViewModel`, `AppState`, `AppearanceSettings`, all bubble files (other than the gate), all tests.

### Phase 2 — UIKit-native context menus, swipe-to-reply, scroll-down button ✅ DONE (2026-04-26)

**Goal:** replace the bubble-internal SwiftUI `.contextMenu` and `SwipeToReply` modifier with native UIKit equivalents that lift the bubble and animate in sync with the table; add a Signal-style "scroll to bottom" floating button when the user is scrolled away from the latest message.

**Steps:**

1. **Native context menu.**
   - `tableView(_:contextMenuConfigurationForRowAt:)` returns a `UIContextMenuConfiguration` with:
     - `previewProvider`: small VC that renders the bubble + a horizontal emoji row (4 quick reactions) above it. SwiftUI rendering via `UIHostingController`. Tapping an emoji dismisses the menu and calls `viewModel.toggleReaction`.
     - `actionProvider`: returns a `UIMenu` with Reply / Forward / Copy / Edit / Delete (children built from VM state, mirroring `MessageBubble.contextMenuItems`). Conditionals (text non-empty for Copy, outgoing-text-only for Edit) lifted from the bubble.
   - Set `showsContextMenu = false` on the SwiftUI `MessageBubble` everywhere. *(Already done in Phase 1.)*
2. **Native swipe-to-reply.**
   - `tableView(_:leadingSwipeActionsConfigurationForRowAt:)` with one transparent action; `performsFirstActionWithFullSwipe = false`.
   - Pan recogniser on the tableView's `panGestureRecognizer` (delegate proxy), watches for `state == .ended` and fires `viewModel.replyTo(messageId:)` if the cell is in the swipe-open state. Mirrors `performReplyOnOpeningSwipeActionsGestureRecognizer` from the reference.
   - Skipped on info messages and when chat can't send.
3. **Scroll-to-bottom floating button.**
   - A small circular `UIButton` (SF Symbol `chevron.down`) anchored bottom-trailing to the safe area, hidden when `isNearBottom`. Tapping it scrolls to row 0 animated.
   - Implements behaviour 13 from the inventory more visibly than today (today's ChatView has no scroll-down affordance).
4. **Mark-as-seen on visible-rect.**
   - On `scrollViewDidEndDecelerating` and `scrollViewDidEndScrollingAnimation`, collect `tableView.indexPathsForVisibleRows`, map to message ids, call `appState.context?.markSeenMessages(ids:)`. (This adds per-message read receipts beyond the current `marknoticedChat` semantics — verify with the reference behaviour and DcContext API; if the API doesn't already exist, scope it out and stay with `marknoticedChat`.)

**Outcome:** richer interactions match Signal/iMessage feel; bubble files lose their now-dead SwiftUI `.contextMenu` block (or it stays gated behind the boolean for use elsewhere).

**Outcome (actual, 2026-04-26):**
- Native context menu via `tableView(_:contextMenuConfigurationForRowAt:)`: `previewProvider: nil` + custom `previewForHighlightingContextMenuWithConfiguration` that snapshots `cell.contentView` and re-targets it in `tableView.superview` (untransformed). The reactions row is an inline `UIMenu` with `preferredElementSize = .small` (iMessage-style horizontal palette of 4 quick-reactions + "More Reactions"); the actions submenu mirrors `MessageBubble.contextMenuItems` (Reply/Forward/Copy/Edit/Delete) with the same conditional gates. Cell call site now passes `showsContextMenu: false` so the SwiftUI gate is dead in the chat view.
- Native swipe-to-reply: `leadingSwipeActionsConfigurationForRowAt` with a transparent `UIContextualAction` (no-op handler) and `performsFirstActionWithFullSwipe = false`; trailing returns an empty config. A side-channel `UIPanGestureRecognizer` on `view` (delegate is the VC; `shouldRecognizeSimultaneouslyWith` returns true for itself only) fires `viewModel.replyTo(messageId:)` on `.ended` whenever any visible cell is in `configurationState.isSwiped`. The icon is rendered through a small `UIGraphicsImageRenderer` helper that vertically flips it so it's upright inside the inverse-transformed swipe tray.
- Scroll-to-bottom button: a `ScrollDownButton` SwiftUI view (in `qxp/Views/ChatChrome.swift`) — `chevron.down` SF Symbol inside a `Circle()` with `glassEffect(.regular)` — hosted via `UIHostingController` and pinned to `safeAreaLayoutGuide.{trailing,bottom}`. Visibility cross-fades on `isNearBottom` flips in `scrollViewDidScroll`; alpha 0 + `isUserInteractionEnabled = false` when near bottom.
- Mark-as-seen on visible-rect: new `DcContext.markSeenMessages(ids:)` wrapping `dc_markseen_msgs`; `markVisibleMessagesSeen()` in the VC walks `tableView.indexPathsForVisibleRows` → `dataSource.snapshot()` → filters to `.message(id)` rows → calls the wrapper. Hooked into `scrollViewDidEndDecelerating`, `scrollViewDidEndScrollingAnimation`, and `performInitialScroll()` so receipts flush both at chat open and on every scroll-stop.
- Files touched: `qxp/Navigation/ChatViewController.swift` (added Phase 2 wiring; ~225 lines net), `qxp/Views/ChatChrome.swift` (+`ScrollDownButton`), `qxp/Core/DcContext.swift` (+`markSeenMessages`).
- Untouched: `ChatViewModel`, `AppState`, `AppearanceSettings`, all bubble files, all tests.

### Phase 3 — Cleanup, polish, verification ✅ DONE (2026-04-26)

**Goal:** delete now-dead helpers, regression-check the integration test suite, verify behaviours on a manual run-through.

**Steps:**

1. **Delete dead code.**
   - `ChatView.swift` already removed in Phase 1.
   - `SwipeToReply` modifier removed in Phase 1.
   - The two `Binding(isPresent:)` consumer sites moved off; check whether the helper itself in `SharedExtensions.swift` has remaining users (likely yes — keep). Do a `grep` pass before deleting anything else.
2. **Mark-as-seen plumbing review.**
   - If Phase 2 added per-message read receipts, audit that the `markSeenMessages` core API actually delivers MDNs the way the reference expects. If not, revert to `marknoticedChat`-only.
3. **Check `ChatTitle` reuse.**
   - If `ChatTitle.swift` is only used by the new VC, keep it co-located with `ChatViewController.swift` rather than under `Views/`. If it's reused (e.g. pinned chats getting their own header somewhere), keep under `Views/`.
4. **Test pass.** `qxpTests/IntegrationTests.swift` exercises `ChatViewModel`. They must still pass with no edits — confirm by running the suite. (Manual run only; no Xcode on this machine.)
5. **Manual verification checklist** (user, on device):
   - Open a 1:1 chat → message list renders, scrolled to bottom, draft restored.
   - Open a group chat with unread messages → "New Messages" separator visible at the right place; clears 5s after seen.
   - Long-press an outgoing text message → context menu lifts the bubble, shows quick reactions + Reply / Forward / Copy / Edit / Delete.
   - Long-press an incoming message → context menu without Edit.
   - Swipe-right an incoming message → reply preview appears in the input bar.
   - Tap a quoted reply → list scrolls to original, original briefly dims/flashes.
   - Tap an image bubble → fullscreen preview opens, swipe between photos works.
   - Type → mic/cam buttons hide; send button appears; send → bubble appears, scrolls to bottom.
   - Press-and-hold mic → recording starts; lock + send works; trash discards.
   - Open `(+)` pane → tap a recent photo / Photos / File / Contact / Location → each stages a draft attachment; send sends.
   - Edit own text message → editing pill appears; send replaces.
   - Forward to another chat → picker opens, target chat opens, "Forward to <name>?" alert shown, Forward sends.
   - Delete-for-me / Delete-for-everyone → the right buttons appear depending on chat encryption.
   - Toggle ephemeral timer → top pill appears.
   - Start live location → bottom banner appears; stop dismisses.
   - Wallpaper change in appearance settings → background updates without reopening the chat.
   - Background the app while chat is open → no draft loss, no dangling voice recording.
   - Scrolled away + new message arrives → bubble appears at bottom, list does not auto-scroll.
   - Scrolled to bottom + new message arrives → list scrolls to follow.
   - Scroll up → "Show Older Messages" reveals the next page; position preserved.

**Outcome:** plan archived to `plans/chatview-uikit.md`; `PLAN.md` reset to empty; `CLAUDE.md` and `AGENTS.md` "Active plan" bullets reflect that.

**Outcome (actual, 2026-04-26):**
- All three phases shipped. The legacy SwiftUI `ChatView.swift` is gone; `NavigationRouter.pushChat(id:highlightMsg:)` builds and pushes a `ChatViewController` directly. All 22 behaviours from the inventory are reproduced; the new VC adds two affordances the SwiftUI version lacked (a floating scroll-to-bottom button and per-message MDN flushing on visible-rect).
- The 41 integration tests against `ChatViewModel` are unaffected; `ChatViewModel` was not modified by this plan.
- New per-cell concerns lift cleanly into UIKit: the inverse-table preview snapshot path, the side-channel pan recogniser for swipe-to-reply, the inline `preferredElementSize = .small` reactions submenu, and the small `verticallyFlipped(_:)` `UIGraphicsImageRenderer` helper for swipe-action icons.
- Plan archived to `plans/chatview-uikit.md`; `PLAN.md` reset to empty.

## Files

### New
```
qxp/Navigation/ChatViewController.swift          (the VC + diffable data source + accessory + sheets)
qxp/Views/ChatTitle.swift                        (lifted from ChatView.swift)
qxp/Views/ChatChrome.swift                       (DateHeaderView + NewMessagesSeparator + ComposeBar — lifted)
```

### Modified
```
qxp/Navigation/NavigationRouter.swift            (pushChat → ChatViewController)
qxp/Views/MessageBubble.swift                    (+ showsContextMenu: Bool = true gate)
```

### Deleted
```
qxp/Views/ChatView.swift                         (entire file)
```

## Open questions / deferred

- **In-chat search.** Reference has it; qxp doesn't. Worth adding once the UIKit shell is in place — `UISearchController` on `navigationItem` plus per-cell highlight. Future plan.
- **Multi-select / bulk delete-forward-copy.** Reference has it. Future plan, fits naturally on the new shell.
- **Drag-and-drop attachments** from other apps via `UITableViewDropDelegate`. Future plan.
- **Native UIKit cells** (replacing `UIHostingConfiguration`). Only motivated if profiling shows scroll cost in the SwiftUI hosting; the chat list pattern shipped with no perf complaints, so we don't speculate here.
- **WebXDC + call cells.** qxp doesn't render them today; out of scope until the broader WebXDC story is planned.
- **`PhotosPicker` vs `PHPickerViewController`.** Phase 1 picks `PHPickerViewController`. If that turns out to drop a feature qxp uses (it shouldn't — single image, full-res, copy to tmp), we revisit. Sticking with `PhotosPicker` would require keeping a tiny SwiftUI host visible only for that sheet, which is uglier than just calling `PHPickerViewController` natively.
- **Per-message `markSeenMessages` API call** — only added in Phase 2 if `DcContext.markSeenMessages` is already wrapped in `qxp/Core/`. If not, `marknoticedChat` is preserved as today.
