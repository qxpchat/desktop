# PLAN: Error Surfacing

## Context

Many user-initiated actions silently fail — the user taps a button and nothing happens. No alert, no feedback. This is confusing UX. The pattern for error alerts already exists in the codebase (ConnectivityView, ScanQrView) using `@State private var errorMessage: String?` + `.alert`. This plan extends it to all silent-failure paths.

**Scope:** only user-facing actions where failure is visible as "nothing happened." Internal operations (pin, mute, ephemeral, block) and core-managed state (message delivery status via state glyphs) are out of scope — they either rarely fail or already surface feedback.

## Audit

**High priority — user action produces no visible result on failure:**

| Location | Operation | Current behavior |
|---|---|---|
| `NewGroupView.createGroup` | `createGroupChat` returns 0 | Silent return. User filled name + picked members for nothing. |
| `NewChannelView.createChannel` | `createBroadcast` returns 0 | Silent return. Same. |
| `ComposeView.openChat` | `createChatByContactId` returns 0 | Silent return. User taps contact, nothing happens. |
| `ChatView.stageRecentPhoto/stageCapturedPhoto/stagePickedPhoto/stagePickedContact` | `try? data.write` fails | Staging proceeds with invalid URL. Send fails at core level — shows as failed message, but staging itself gives no feedback. |

**Medium priority — action fails but context makes it less confusing:**

| Location | Operation | Current behavior |
|---|---|---|
| `ChatViewModel.forwardMessage` | `forwardMessages` | Fire-and-forget. Message doesn't appear in target chat. |
| `ChatViewModel.sendEdit` | `sendEditRequest` | Fire-and-forget. Edit silently doesn't happen. |
| `ChatViewModel.toggleReaction` | `sendReaction` | Return value discarded. |

**Out of scope (already surfaced or non-critical):**

- Send message → delivery state shown via message glyphs (pending/failed/delivered/read).
- Delete message → chat updates on event. If it fails, message stays visible (self-evident).
- Pin/archive/mute/ephemeral/block → local core operations, near-zero failure rate.
- Profile changes (name, image) → change doesn't show up, which is its own signal.
- Transport add/remove → ConnectivityView already has error alerts.
- Login/onboarding → already has error alerts.

## Phase 1: View-Level Errors ✅ DONE (2026-04-17)

**Goal:** Add error alerts to views where user actions silently fail. Use the established `errorMessage: String?` + `.alert` pattern.

**Outcome:** 4 views updated. NewGroupView, NewChannelView, ComposeView show alerts with `context.lastErrorString` on creation failure. ChatView staging methods now use `do/catch` — write failures show alert and prevent staging an invalid URL. `stagePickedFile` already had `do/catch` but returned silently; now shows alert too.

**Steps:**

1. ✅ **NewGroupView** — alert when `createGroupChat` returns 0.
2. ✅ **NewChannelView** — alert when `createBroadcast` returns 0.
3. ✅ **ComposeView** — alert when `createChatByContactId` returns 0.
4. ✅ **ChatView staging** — `stageRecentPhoto`, `stagePickedPhoto`, `stageCapturedPhoto`, `stagePickedContact` now `do/catch` with alert. `stagePickedFile` now shows alert on copy failure.

## Phase 2: ViewModel-Level Errors ✅ DONE (2026-04-17)

**Goal:** Surface errors from ChatViewModel operations through a published error property.

**Outcome:** Added `errorMessage: String?` to ChatViewModel. `toggleReaction` checks `sendReaction` return and sets error on nil. ChatView binds a second `.alert` to `viewModel.errorMessage`. `forwardMessage` and `sendEdit` are void core functions (`dc_forward_msgs`, `dc_send_edit_request`) — no return value to check. Their failures surface via message state events (the glyph system already shows failed/pending/delivered).

**Steps:**

1. ✅ Add `var errorMessage: String?` to ChatViewModel.
2. ✅ Wire `toggleReaction` to set `errorMessage` on failure. `forwardMessage`/`sendEdit` are void core APIs — failures surface via message state glyphs.
3. ✅ Add `.alert` in ChatView bound to `viewModel.errorMessage`.

---

## Open Questions

- Should staging failures prevent the attachment from being staged entirely (early return), or stage it and let the send fail? Leaning toward early return with alert — clearer UX.
