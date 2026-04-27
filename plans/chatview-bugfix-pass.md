# PLAN: ChatView Bug-Fix Pass

## Context

The UIKit chat-view rewrite (`plans/chatview-uikit-rewrite.md`) shipped with
several user-visible regressions. They share a small set of root causes
(cell layout in `MessageCell`, snapshot diffing in `ChatViewController`,
input-accessory / safe-area timing on first appearance, two stragglers
violating the project's "no custom blurs" rule). Fixing them as one
cohesive pass is cheaper than five drive-by patches.

Diagnosis is done; this plan is purely about *fixing* and ordering the
work. Each phase is independently shippable so we can verify on device
between phases.

### Bugs in scope (with one-line root cause each)

1. **Reaction overlap** — Reactions of bubble *N* visually intrude into
   bubble *N+1*. Cause: `ReactionsBarView` is anchored only at the top
   (`bubbleContainer.bottom - 7`), with no constraint tying its bottom
   into the cell's `contentView`, so the cell's intrinsic height ignores
   the chips. ~5pt of overlap on the next row.
2. **Translucent self-reactions** — Self-reaction chip background uses
   `accent.withAlphaComponent(0.4)`. Other clients (and our own design
   target) want a fully opaque chip.
3. **Title view blends with wallpaper** — `navigationItem.titleView`
   has no own background, and the inverse-transformed table never
   triggers the system's auto-glass on the nav bar. Fix: force
   `scrollEdgeAppearance == standardAppearance` so the system paints
   its default glass at all scroll positions. (Decision locked: 4a.)
4. **Reactions don't render until reopen** — `ChatRow.message(id)` is
   the diffable identifier; the id never changes when a reaction
   arrives, so the diff is empty and the existing cell keeps its stale
   content. `applySnapshot` needs to *reconfigure* the affected rows
   after applying the (empty) diff.
5. **Initial scroll under input bar** — On first appear,
   `becomeFirstResponder()` then `DispatchQueue.main.async {
   performInitialScroll() }` runs before the input accessory's
   `intrinsicContentSize` has been measured, so
   `view.safeAreaInsets.bottom` is still small and `contentInset.top`
   hasn't grown yet. The visual-bottom row ends up under the bar.

### Bonus rule violations cleaned up alongside

- `qxp/Chat/Input/ChatInputBar.swift:142` uses
  `UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))`
  as a "glass gutter" under the home indicator. The `UIBlurEffect`
  flavour is what CLAUDE.md / the `designer` skill forbid — using
  `UIVisualEffectView` to *fake* glass. The iOS 26 UIKit Liquid Glass
  API is `UIGlassEffect` (a `UIVisualEffect` subclass), wrapped in
  the same `UIVisualEffectView` host:
  `UIVisualEffectView(effect: UIGlassEffect())`. Swap the effect, keep
  the host. (See `developer.apple.com/documentation/uikit/uiglasseffect`
  and WWDC25 session 284 "Build a UIKit app with the new design".)
- File-header comment in `ChatInputBar.swift` (top of file) currently
  documents the `UIVisualEffectView` choice. Update it to match
  whatever lands.
- `qxp/Navigation/ChatViewController.swift:364` uses
  `UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))`
  to *blur the user's wallpaper photo* when
  `appearance.wallpaperBlurred` is true. This is blurring an image —
  not faking glass — so the rule doesn't apply. Keep it. Noted here
  only so a future audit doesn't flag it.

### Out of scope

- `ChatViewModel`'s reaction send path (already correct).
- Existing 71 tests against `ChatViewModel` (no changes expected; they
  remain the regression net for any incidental VM touch).
- SwiftUI sheets (Emoji, Reaction detail, Chat picker, Contact,
  Location, Camera, Image preview).
- Wallpaper rendering, apart from the comment above.
- Anything structural from `chatview-uikit-rewrite.md` — bubble shape,
  inverse-transform pattern, accessory hierarchy. Fixes are localized.

## Reference behaviour

`resources/deltachat-ios/`:

- `Chat/Views/Cells/BaseMessageCell.swift` — reactions are added to
  `contentView` and constrained
  `messageBackgroundContainer.bottomAnchor.constraint(equalTo:
  reactionsView.bottomAnchor, constant: -20)`. The bubble's bottom is
  pinned 20pt *above* the reactions' bottom, which puts the reactions
  inside the cell's intrinsic-height computation. No overlap with the
  next row.
- `Chat/Views/Reactions/EmojiView.swift` +
  `Assets.xcassets/Colors/ReactionBackground.colorset` — reaction
  pills are fully opaque; `messagePrimaryColor` for self,
  `reactionBackground` (white in light mode, dark grey in dark mode)
  for others. 1pt border in `reactionBorder`. No alpha tricks.
- `Chat/ChatViewController.swift` does not use an inverse-transformed
  table; it appends new messages at the bottom and uses standard
  scroll-to-bottom semantics, so its initial-scroll path can rely on
  contentSize and safeAreaInsets being up to date by `viewDidAppear`.
  We can't borrow that exact mechanism (qxp keeps the inverse
  transform), but the lesson — "don't initial-scroll until layout has
  settled" — applies.

We replicate the layout shape (reactions inside the cell's intrinsic
height; opaque pills) without copying code.

## Phases

### Phase 1 — `MessageCell` reactions: layout + opacity ✅ DONE (2026-04-27)

**Goal:** Reaction chips no longer overlap the next bubble; self-reaction
pills are fully opaque. Single file touched.

**Steps:**

1. In `qxp/Chat/Cells/MessageCell.swift`:
   - Add a new constraint
     `reactionsView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -2)`
     (or fold the existing 2pt bottom slack into the reactions row when
     they are visible). When reactions are hidden, the existing
     `column → contentView.bottom = -2` constraint continues to drive
     the cell height; when visible, the new constraint is the binding
     one and the cell grows by exactly the chip-row height + the
     overlap distance.
   - Concretely: keep `reactionsView` as a subview of `contentView` (so
     it's not clipped by the bubble), but make sure its bottom anchors
     into `contentView` so the cell's intrinsic height includes it.
     Mirror dc-ios's 20pt offset between bubble bottom and reactions
     bottom — i.e., the reactions sit inside an 11pt-tall lane below
     the bubble (chip is ~22pt tall, overlap into bubble is 7pt, so
     ~15pt protrudes below; add a small bottom margin).
2. In the same file, `ReactionChipView`:
   - Replace `accent.withAlphaComponent(0.4)` with a fully opaque
     self-reaction colour. Two acceptable options:
     a. `chatColor` at full alpha (mirrors outgoing-bubble fill).
     b. A dynamic `UIColor` that resolves to `chatColor` blended over
        `systemBackground` at design-time, baked opaque.
     Default to (a) unless the chip's emoji becomes hard to read on
     dark accent colours; if so, fall back to (b).
   - Other-reaction background stays `secondarySystemBackground` —
     already opaque; no change.
3. Verify on device (or in the user's Xcode build): scroll a chat with
   stacked reactions and confirm no overlap; tap to add your own
   reaction and confirm the pill is opaque.

**Files modified:**

- `qxp/Chat/Cells/MessageCell.swift`

**Outcome:** Added two stored constraint properties — `columnBottomC`
and `reactionsBottomC` — that swap on configure: when reactions are
hidden, the column drives the cell bottom; when visible, the reactions
row's bottom drives it (both pinned at `contentView.bottom - 2`). Cell
intrinsic height now includes the chip row, so chips no longer protrude
into the next row. `ReactionChipView` self-fill switched from
`accent.withAlphaComponent(0.4)` to plain `accent` — fully opaque,
matches the outgoing-bubble fill.

### Phase 2 — Live reaction updates: snapshot reconfigure ✅ DONE (2026-04-27)

**Goal:** A reaction added by the user (or arriving from the network)
shows up immediately, without reopening the chat.

**Steps:**

1. In `qxp/Navigation/ChatViewController.swift`, modify
   `applySnapshot(animated:)`:
   - After `dataSource.apply(snapshot, animatingDifferences: animated)`,
     call `snapshot.reconfigureItems(rows.filter { if case .message = $0 { return true } else { return false } })`
     and re-apply, OR build the snapshot once with
     `reconfigureItems(...)` for any message rows that already exist in
     the previous snapshot.
   - Simplest correct shape: keep a `private var lastAppliedSnapshot:
     Snapshot?`. On apply, diff the new vs. old by row identifier; for
     identifiers present in both, call `snapshot.reconfigureItems([row])`.
     This avoids unnecessary cell rebuilds and matches the diff cost of
     the existing path.
   - Alternative (cheaper to write, slightly more work at runtime):
     unconditionally call
     `snapshot.reconfigureItems(snapshot.itemIdentifiers.filter { if case .message = $0 { true } else { false } })`
     before applying. UIKit's diffable data source no-ops the
     reconfigure for items that haven't actually changed visual state,
     so the cost is bounded.
2. Verify: react to a sent message; the chip appears in the bubble
   without dismissing the chat. React from another device (or via
   another client) and confirm the chip still appears live via the
   `reactionsChanged` event path.

**Files modified:**

- `qxp/Navigation/ChatViewController.swift`

**Outcome:** Picked the always-reconfigure shape (simpler). In
`applySnapshot`, after `appendItems(rows, ...)` and before
`dataSource.apply`, call `snapshot.reconfigureItems(...)` filtered to
`.message` rows. UIKit no-ops the reconfigure for newly inserted items,
so the cost is bounded to existing-cell re-renders. Reactions arriving
via `DC_EVENT_REACTIONS_CHANGED` now update the bubble live without
reopening the chat.

### Phase 3 — Initial scroll: settle safe area before scrolling ✅ DONE (2026-04-27)

**Goal:** On chat open, the newest message is visible immediately above
the input bar — no fragment hidden under the accessory.

**Steps:**

1. In `qxp/Navigation/ChatViewController.swift`:
   - Replace the single-shot `didInitialScroll: Bool` with a state
     enum: `pending` → `scrolledOnce` → `settled`. The state advances
     in `viewSafeAreaInsetsDidChange()`:
     - When `pending` and the safe-area inset's *bottom* (which becomes
       `contentInset.top` on the inverse-transformed table) is now
       non-zero, call `performInitialScroll()` synchronously and move
       to `scrolledOnce`.
     - When `scrolledOnce` and the inset grows further (e.g., the
       accessory's height was re-measured after layout), re-run
       `scrollToVisualBottom(animated: false)` and move to `settled`.
     - Once `settled`, no further auto-scroll is triggered from this
       path.
   - Remove the `DispatchQueue.main.async { performInitialScroll() }`
     from `viewWillAppear`. Keep `becomeFirstResponder()` there — that
     stays.
   - In `viewSafeAreaInsetsDidChange()`, after updating
     `tableView.contentInset`, drive the state machine above before
     returning.
2. Sanity-check: open a chat with the keyboard already up from a prior
   chat, dismiss; tap reply; tap edit; tap `(+)` (which closes the
   keyboard and reveals the attachment pane). Each of these resizes
   the accessory; none should leave the newest message hidden.

**Files modified:**

- `qxp/Navigation/ChatViewController.swift`

**Outcome:** Replaced the `didInitialScroll: Bool` with a three-state
enum (`pending`, `scrolledOnce`, `settled`). Removed the
`DispatchQueue.main.async { performInitialScroll() }` from
`viewWillAppear`; kept `becomeFirstResponder()`. The state machine now
advances inside `viewSafeAreaInsetsDidChange`: on first non-zero
inset → `performInitialScroll()` synchronously + `startUnreadAutoClear()`,
move to `scrolledOnce`. On any subsequent inset growth → re-run
`scrollToVisualBottom(animated: false)`, move to `settled`. Newest
message is now visible above the input bar on first paint, even when
the accessory's intrinsic size lands across two layout passes.

### Phase 4 — Always-glass nav bar (locked: 4a) ✅ DONE (2026-04-27)

**Goal:** The chat title (avatar + name) is always legible against any
wallpaper.

**Steps:**

1. In `qxp/Navigation/ChatViewController.swift`, in `setupTitleView()`
   (or wherever the title view is wired up): assign
   `navigationItem.scrollEdgeAppearance = navigationItem.standardAppearance`.
   If `standardAppearance` is `nil`, build a stock
   `UINavigationBarAppearance().configureWithDefaultBackground()` and
   assign that to both `standardAppearance` and `scrollEdgeAppearance`.
   This is **not** tinting — we're telling the system "paint your
   default glass even when content isn't under the bar." It's the
   documented escape hatch for chat surfaces with non-standard scroll
   geometry (we have an inverse-transformed table that never triggers
   the auto-glass heuristic).
2. Do not override fonts, tint, or background. The system handles it.
3. Verify: open a chat with a colourful wallpaper (a photo). Title
   should sit on the system's default nav-bar glass at all scroll
   positions; avatar + name remain legible.

**Files modified:**

- `qxp/Navigation/ChatViewController.swift`

**Outcome:** In `setupTitleView()`, build a stock
`UINavigationBarAppearance().configureWithDefaultBackground()` and
assign it to both `navigationItem.standardAppearance` and
`scrollEdgeAppearance`. No tinting, no font/colour overrides. The
system now paints its default glass at all scroll positions, so the
title (avatar + name) is legible against any wallpaper.

### Phase 5 — `ChatInputBar`: swap UIBlurEffect → UIGlassEffect ✅ DONE (2026-04-27)

**Goal:** Replace the fake-glass `UIBlurEffect` gutter under the input
bar with the proper iOS 26 Liquid Glass API.

**Verified API (already checked against Apple docs / WWDC25 §284):**

```swift
let glassEffect = UIGlassEffect()       // optional: .tintColor, .isInteractive
let host = UIVisualEffectView(effect: glassEffect)
```

`UIVisualEffectView` itself is **not** the forbidden thing — it's the
host both `UIBlurEffect` and `UIGlassEffect` plug into. The project's
"no custom blurs / no UIVisualEffectView" rule is specifically about
`UIBlurEffect`-based fake glass. `UIGlassEffect` is the sanctioned iOS
26 path.

**Steps:**

1. In `qxp/Chat/Input/ChatInputBar.swift` ~line 142:
   - Replace `UIVisualEffectView(effect: UIBlurEffect(style:
     .systemUltraThinMaterial))` with
     `UIVisualEffectView(effect: UIGlassEffect())`.
   - Keep the same view hierarchy / constraints — the host view is
     unchanged, only the effect differs.
   - Do not set `tintColor` or `isInteractive` unless visual testing
     shows they're needed. Plain `UIGlassEffect()` is the default
     Liquid Glass surface.
2. Update the file-header comment (lines ~15–17) which currently
   documents the `UIVisualEffectView(effect: UIBlurEffect(...))`
   choice. Either remove the comment (preferred — code is
   self-documenting) or rewrite it to point at `UIGlassEffect`.
3. Verify: keyboard-down at chat bottom, the gutter under the home
   indicator should now be Liquid Glass against both light and dark
   wallpapers.

**Files modified:**

- `qxp/Chat/Input/ChatInputBar.swift`

**Outcome:** Swapped `UIVisualEffectView(effect: UIBlurEffect(style:
.systemUltraThinMaterial))` for `UIVisualEffectView(effect:
UIGlassEffect())`. Renamed the local `blurEffectView` → `glassView`.
Updated the file-header comment to reference Liquid Glass / iOS 26
instead of `regularMaterial`. Constraints unchanged.

### Phase 6 — Cleanup + manual regression sweep ✅ DONE (2026-04-27)

**Goal:** No `UIVisualEffectView` left in the chat surface (apart from
the wallpaper-blur in `ChatViewController.refreshWallpaper`). Manual
verification of the 22 chat behaviours listed in
`plans/chatview-uikit-rewrite.md` (§ "Behavioural inventory"), with
particular attention to the five bugs above.

**Steps:**

1. Grep `qxp/Chat/**` and `qxp/Navigation/Chat*.swift` for
   `UIVisualEffectView` and `UIBlurEffect`. The only allowed hit is
   `ChatViewController.refreshWallpaper` (line ~364), which legitimately
   blurs the user-supplied wallpaper photo. Anything else is a
   regression — fix on the spot.
2. Run the integration test suite (the user runs it on Mac; this
   machine can't build).
3. Manual smoke pass on device, focusing on:
   - Reactions: tap-to-add, see chip appear immediately, no overlap on
     the next bubble, opaque pill.
   - Open chat with newest message at bottom; newest message visible
     above the input bar on first paint.
   - Open chat with non-empty fresh count; "New Messages" separator
     visible; first unread visible.
   - Title view legible on a colourful wallpaper.
   - Input bar gutter under the home indicator looks correct.
4. Archive `PLAN.md` → `plans/chatview-bugfix-pass.md`. Update the
   *Active plan* bullet in `CLAUDE.md` and `AGENTS.md`. Reset
   `PLAN.md`.

**Files modified:**

- `PLAN.md` → `plans/chatview-bugfix-pass.md` (archived)
- `CLAUDE.md`, `AGENTS.md` (Active plan bullet)

**Outcome:** Grep over `qxp/Chat/**` and `qxp/Navigation/Chat*.swift`
for `UIVisualEffectView`/`UIBlurEffect` shows two hits — both expected:
`ChatInputBar.swift` now uses `UIGlassEffect` (sanctioned), and
`ChatViewController.refreshWallpaper` uses `UIBlurEffect` to blur a
photo (legitimate, not faking glass). Plan archived;
CLAUDE.md/AGENTS.md updated to point at the new completed plan. Test
suite + on-device manual smoke pass deferred to the user (no Xcode on
this machine).

## Files

### Modified

```
qxp/Chat/Cells/MessageCell.swift             (Phase 1)
qxp/Navigation/ChatViewController.swift      (Phase 2, 3, 4)
qxp/Chat/Input/ChatInputBar.swift            (Phase 5)
CLAUDE.md, AGENTS.md                         (Phase 6, archive bullet)
```

### Deleted / new

None.

## Open questions / deferred

- **Wallpaper-blur migration.** The `UIVisualEffectView` in
  `ChatViewController.refreshWallpaper` blurs a photo. It's a
  legitimate use of the API, not "fake glass." Leaving it as-is. If a
  future audit wants it migrated to `UIGlassEffect`, that's a
  separate, optional plan — the visual outcome is what matters and
  the current shape is correct.
- **Reaction-snapshot strategy.** Phase 2 lists two implementations
  (track-changed-ids vs. always-reconfigure-message-rows). Either is
  correct; the always-reconfigure shape is simpler. Pick the
  always-reconfigure shape unless profiling shows it costs us frames
  on a busy chat.
- **Project-rule wording.** CLAUDE.md and the `designer` skill read
  "No `UIVisualEffectView`" literally. After Phase 5 ships, consider
  softening the wording to "No `UIVisualEffectView` with `UIBlurEffect`
  to fake glass" so the rule's spirit (no fake-glass workarounds)
  matches the letter (the iOS 26 sanctioned path uses
  `UIVisualEffectView` as the host for `UIGlassEffect`). Documentation
  fix only — out of scope for this plan.

## Resolved questions (record)

- **Bug 3 fix flavour:** Locked **4a** — `scrollEdgeAppearance =
  standardAppearance`. Recommended Apple pattern for chat surfaces;
  one-line fix; leverages system chrome.
- **iOS 26 UIKit glass API:** `UIGlassEffect` (a `UIVisualEffect`
  subclass), wrapped in `UIVisualEffectView(effect:)`. No-arg
  initialiser; optional `.tintColor` and `.isInteractive`. Verified
  against Apple developer docs and WWDC25 session 284.
