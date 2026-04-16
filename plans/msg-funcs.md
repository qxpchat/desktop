# PLAN: Message Actions & Emoji Picker

## Context

Chat messages currently have no long-press actions beyond 6 hardcoded reaction emoji. Users cannot reply, forward, copy, or delete messages. The existing `.contextMenu` on `MessageBubble` only surfaces reactions — no other actions exist.

This plan adds a full message context menu (matching the official Delta Chat client's feature set) and a custom-built emoji picker for reactions beyond the quick-access row.

**In scope**

- Message context menu: Reply, Copy, Forward, Edit, Delete + existing quick reactions row.
- Custom emoji picker sheet: search (via Foundation's Unicode name transform), recents, all emoji in a categorised grid.
- Wire up reply (quote): `draftReplyTo` already exists but is not connected to UI.
- Wire up forward: `dc_forward_msgs` exists in the C API but has no Swift wrapper.
- Wire up edit: `dc_send_edit_request` + `dc_msg_is_edited` in C API, no Swift wrapper yet. Own outgoing text messages only.
- Wire up delete with confirmation.
- Swipe-to-reply gesture (leading swipe on message row).

**Out of scope**

- Multi-select / batch operations.
- Pin/save messages.
- Skin tone picker (can revisit).
- Customisable reaction set.

**Reference clients (read, do not import)**

- Delta Chat iOS: `resources/deltachat-ios/deltachat-ios/Chat/ChatViewController.swift` — `tableView(_:contextMenuConfigurationForRowAt:)` at ~L1964, `appendReactionItems` at ~L1897. Uses `UIContextMenuConfiguration` with inline reactions (iOS 16+), reply/forward/copy/delete actions, and MCEmojiPicker library for full picker.
- Signal iOS: `resources/Signal-iOS/Signal/src/ViewControllers/MessageReactionPicker.swift` — 6-emoji reaction bar + "more" button. `resources/Signal-iOS/Signal/Emoji/EmojiPickerSheet.swift` — custom sheet with search, categories, recents, skin tones. Fully custom, ~15 files, code-generated emoji database.

---

## Reference behaviour

### Delta Chat iOS context menu (observed)

Long-press a message → native `UIContextMenuConfiguration` popup with blur backdrop. The menu shows:
1. **React row** — 3 quick emoji (👍 👎 ❤️) + "•••" for full picker. On iOS 16+ rendered inline with `.preferredElementSize = .small`.
2. **Reply** — enters reply mode, input bar shows quoted message bar.
3. **Forward** — navigates to chat picker, sends message to selected chat.
4. **Copy** — copies message text to clipboard.
5. **Delete** — destructive action, confirms via alert, calls `dc_delete_msgs`.
6. "More…" submenu: Reply Privately (groups), Share, Info, Select.

When menu opens: bubble is hidden behind the system preview snapshot. On dismiss: bubble restores. Also supports swipe-to-reply (leading swipe).

### Signal iOS reaction flow (observed)

Long-press → custom context menu with reaction bar pinned above the message preview. Bar shows 6 configurable emoji + "more" button. Tapping "more" opens `EmojiPickerSheet` — a modal sheet with search bar, category toolbar at bottom, `UICollectionView` grid. Recents section shown first. Search uses generated name/keyword index. Skin tone picker on long-press of any emoji.

### Current qxp state (baseline)

- `MessageBubble.swift:225,242` — `.contextMenu { reactionMenu }` with 6 hardcoded emoji.
- `ChatViewModel.swift:387` — `toggleReaction(msgId:emoji:)` sends via JSON-RPC.
- `ChatViewModel.swift:129` — `draftReplyTo: UInt32? = nil` exists but never set.
- `DcMsg.swift:97` — `setQuote(_ quote: DcMsg?)` exists.
- `DcContext.swift:149` — `deleteMessages(ids:)` exists.
- `dc_forward_msgs` in C header but no Swift wrapper.
- `dc_send_edit_request(ctx, msg_id, new_text)` in C header — edits own outgoing text messages. No Swift wrapper.
- `dc_msg_is_edited(msg)` in C header — returns whether a message was edited. No Swift wrapper.
- No copy-to-clipboard code anywhere in message rendering.

---

## Phase 0: Core bindings + view model actions ✅

**Goal:** Add the missing Swift wrappers and view model methods so the UI phases have something to call. No UI changes.

### Steps

1. **`DcContext.swift`** — add:
   - `forwardMessages(ids:chatId:)` wrapping `dc_forward_msgs`.
   - `sendEditRequest(msgId:newText:)` wrapping `dc_send_edit_request`.

2. **`DcMsg.swift`** — add `isEdited: Bool` computed property wrapping `dc_msg_is_edited`.

3. **`ChatViewModel.swift`** — add action methods:
   - `replyTo(messageId:)` — sets `draftReplyTo`, reads the `DcMsg` to populate a visible quoted-message bar in the input area. Adjusts `buildMessage` to call `msg.setQuote(quotedMsg)` when `draftReplyTo` is set.
   - `cancelReply()` — clears `draftReplyTo`.
   - `deleteMessage(id:)` — calls `context.deleteMessages(ids: [id])`.
   - `copyMessageText(id:)` — copies `message.text` to `UIPasteboard.general`.
   - `forwardMessage(id:toChatId:)` — calls `context.forwardMessages(ids: [id], chatId: toChatId)`.
   - `startEditingMessage(id:)` — sets `editingMessageId`, populates `draftText` with the message's current text, focuses the input field.
   - `cancelEditing()` — clears `editingMessageId`, restores previous draft text.
   - `sendEdit()` — calls `context.sendEditRequest(msgId:newText:)`, clears editing state.

4. **`ChatViewModel.swift`** — new state:
   - `editingMessageId: UInt32? = nil` — non-nil while editing a sent message. When set, the send button dispatches to `sendEdit()` instead of `send()`.
   - `draftReplyMessage: MessageItem?` (computed or stored) so the UI can show who/what is being replied to.

5. **`ChatViewModel.swift`** — update `buildMessage` to wire `draftReplyTo` into the outgoing message via `msg.setQuote(quotedMsg)` when non-nil.

6. **`MessageItem`** — add `isEdited: Bool` field, populated from `msg.isEdited` during `load()`.

---

## Phase 1: Context menu actions (reply, copy, delete) ✅

**Goal:** Expand the long-press context menu on every message bubble to include Reply, Copy Text, and Delete alongside the existing reaction row. Wire the reply-quote bar into the input area.

### Steps

1. **`MessageBubble.swift`** — expand the `.contextMenu` builder. New callbacks on the struct:
   - `onReply: (UInt32) -> Void`
   - `onCopy: (UInt32) -> Void`
   - `onEdit: (UInt32) -> Void`
   - `onDelete: (UInt32) -> Void`
   
   Menu layout:
   ```
   ForEach(commonReactions) { emoji button }    // existing
   Divider()
   Button("Reply", systemImage: "arrowshape.turn.up.left")
   Button("Copy", systemImage: "doc.on.doc")      // only if text non-empty
   Button("Edit", systemImage: "pencil")           // only if outgoing + text-only + not info
   Button("Delete", systemImage: "trash", role: .destructive)
   ```

2. **`ChatView.swift`** — pass the new callbacks through to `MessageBubble`, wiring to the view model methods. Add a delete confirmation alert (`confirmationDialog`).

3. **Reply quote bar** — when `viewModel.draftReplyTo != nil`, show a quote preview bar above the text field in `MessageInputBar` (or as a new view stacked above it in ChatView's bottom safe area). Shows quoted sender name + text snippet + close button. Tapping close calls `viewModel.cancelReply()`.

4. **Edit bar** — when `viewModel.editingMessageId != nil`, show a bar above the text field (similar to reply bar but with a pencil icon and "Editing" label + close button). The text field is pre-filled with the message's current text. Send button dispatches to `sendEdit()`. Close button calls `cancelEditing()`.

5. **"(edited)" indicator** — in `MessageBubble.footer`, when `message.isEdited`, append a small "edited" label next to the timestamp.

6. **`ChatView.swift`** — pass `ScrollViewProxy` (or a scroll callback) so that tapping Reply can optionally scroll to show the input bar.

### Outcome check

- Long-press any message → menu shows reactions row + Reply + Copy + Edit (own text only) + Delete.
- Tap Reply → quote bar appears above input, type and send → message arrives with quoted-reply bar.
- Tap Copy → text on clipboard.
- Tap Edit → edit bar appears, text field pre-filled → modify text → send → message updates, shows "(edited)".
- Tap Delete → confirmation → message disappears.

---

## Phase 2: Forward flow ✅

**Goal:** Forward a message to another chat via a chat picker sheet.

### Steps

1. **`MessageBubble.swift`** — add `onForward: (UInt32) -> Void` callback. Add Forward button to context menu between Reply and Copy.

2. **`ChatPickerSheet.swift`** (new) — a simple sheet listing all chats (reuse `AppState`'s chatlist or load via `DcChatlist`). Searchable list, each row shows avatar + chat name. Tap selects and dismisses.

3. **`ChatView.swift`** — present `ChatPickerSheet` when forward is triggered. On selection, call `viewModel.forwardMessage(id:toChatId:)`. Show a brief confirmation (e.g. toast or the sheet dismisses with haptic).

### Outcome check

- Long-press → Forward → chat picker appears → pick a chat → message forwarded → picker dismisses.

---

## Phase 3: Emoji picker (custom, from scratch) ✅

**Goal:** A lightweight emoji picker sheet so users can react with any emoji, not just the 6 quick ones. Search + recents + categorised grid. ~250 lines of SwiftUI + one data file.

### Steps

1. **Emoji data file** — `qxp/Resources/EmojiData.swift`. A static `[EmojiCategory]` array where each category has a name, SF Symbol, and `[String]` of emoji. Generated once from Unicode CLDR / emoji-test.txt. ~1800 emoji across 8 categories (Smileys, People, Animals, Food, Activities, Travel, Objects, Symbols & Flags). This is a pure data file — no logic.

2. **`EmojiPickerSheet.swift`** (new) — presented as a `.sheet` with medium + large detents.
   - **Search bar** at top — filters emoji by Unicode name via `String.applyingTransform(.toUnicodeName, reverse: false)`. Computed lazily and cached.
   - **Recents section** — first row, pulled from `UserDefaults`. Up to 30 recent emoji. Updated on every pick.
   - **Category grid** — `LazyVGrid` with `adaptive(minimum: 42)` columns. Each category separated by a thin header (category name). No category toolbar — search replaces the need.
   - **Tap** → calls completion with emoji string, dismisses sheet, records to recents.

3. **`MessageBubble.swift`** — add a "more" button (•••) at the end of the reactions row in the context menu. Tapping it triggers `onPickEmoji: (UInt32) -> Void`.

4. **`ChatView.swift`** — present `EmojiPickerSheet` when "more" is tapped. On emoji selection, call `viewModel.toggleReaction(msgId:emoji:)`.

### Outcome check

- Long-press → tap "•••" → emoji sheet slides up.
- Type in search → grid filters to matching emoji.
- Recents row shows previously picked emoji.
- Tap any emoji → reaction sent, sheet dismisses.

---

## Phase 4: Swipe-to-reply ✅

**Goal:** Quick reply via leading swipe on a message row, matching Delta Chat iOS and Signal behaviour.

### Steps

1. **`ChatView.swift`** — add a `.swipeActions(edge: .leading)` on each `MessageBubble` row with a Reply button (SF Symbol `arrowshape.turn.up.left`). On trigger, call `viewModel.replyTo(messageId:)` and focus the input field.

2. Verify haptic feedback fires on swipe completion (SwiftUI default).

### Outcome check

- Swipe right on any message → Reply action appears → complete swipe → quote bar appears, keyboard opens.

---

## Phase 5: Polish ✅

**Goal:** Tighten the details across all phases.

### Steps

1. **Haptics** — `UIImpactFeedbackGenerator` on reply, copy, delete, forward, emoji pick.
2. **Accessibility** — labels on all context menu items, VoiceOver announces "Reply to [sender]", "Delete message", etc.
3. **Dark mode** — spot-check emoji picker, quote bar, chat picker sheet.
4. **Info messages** — exclude info rows from context menu (they're system messages, not actionable).
5. **Empty-text guard** — hide Copy button when `message.text` is empty (image-only, voice, etc.).
6. **Forward of non-text** — verify `dc_forward_msgs` correctly handles images, files, voice, location, vcard.

---

## File summary

### New files

```
qxp/Views/EmojiPickerSheet.swift      — custom emoji picker (search + recents + grid)
qxp/Resources/EmojiData.swift         — static emoji data (~8 categories, ~1800 emoji)
qxp/Views/ChatPickerSheet.swift       — chat selector for forward flow
qxp/Views/ReplyBar.swift              — quoted-message bar above input field
```

### Modified

```
qxp/Core/DcContext.swift              — add forwardMessages + sendEditRequest wrappers
qxp/Core/DcMsg.swift                  — add isEdited getter
qxp/State/ChatViewModel.swift         — replyTo / cancelReply / deleteMessage / copyMessageText / forwardMessage / startEditingMessage / cancelEditing / sendEdit + wire draftReplyTo into buildMessage
qxp/Views/MessageBubble.swift         — expand contextMenu, add new callbacks, "(edited)" footer indicator
qxp/Views/ChatView.swift              — wire callbacks, present sheets, swipe-to-reply, delete confirmation, edit mode
```
