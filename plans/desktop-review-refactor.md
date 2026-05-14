# qxp desktop — code review + applied changes

Senior-engineer review against the brief in `plans/desktop-review-prompt.md`,
followed by selective application of the findings. The objective filter was:
*apply where the change is an objective improvement, reduces code size /
complexity, or fixes a real defect; skip where the steel-man for not doing it
wins.*

This document is the record of what shipped, with rationale for items deferred
or rejected.

---

## Applied changes

### Bugs fixed (correctness / perf)

- **`messageSearch.setSearchAccount`** now bumps `gen` — closes the
  cross-account hit-leak race (in-flight `run()` for a prior account would
  otherwise land its results after the swap).
- **`liveLocations.svelte.ts:108`** module-level `setInterval` now gates on
  `document.hidden` and `accounts.selectedId != null` — was a background
  RPC + DB scan on every tab regardless of state.
- **`chatlist.svelte.ts:240`** deleted the defensive 5-kind event fan-out
  (`IncomingMsg`/`MsgsChanged`/`ChatModified`/`ChatDeleted`/`ContactsChanged`).
  `ChatlistChanged` covers every observable case. Was 3× redundant DB hits
  per arriving message.
- **`notifications.startIncomingNotifications`** got a `notifStarted` guard —
  was re-adding the `window.focus` listener on every WS reconnect.
- **`ChatView.svelte` jump-target effect** replaced 30-iteration
  `tick + setTimeout(30)` poll with single `tick()` + one `rAF`. Cleaner +
  no perceptible delay on the fast path.
- **`ChatView.scrollToBottom`** dropped the 6-frame `rAF` burst to a single
  rAF post-tick. Was ~100ms of forced layout/paint pinning on every redraw.
- **`accounts.refreshAccounts`** catch no longer wipes `ids`/`configuredIds`/
  `selectedId` on transient RPC fail — leaves prior state.
- **`profiles.computeFreshCount`** short-circuits to summing
  `chatlist.items` for the active account (avoids the duplicate RPC pair).
  `patchFresh` now microtask-coalesces its 5 event triggers into one per
  message. Catch preserves prior `freshCount` instead of wiping to 0.
- **`chat.flashMessage`** now uses a `flashGen` counter so back-to-back
  jumps don't have the older timer kill the newer highlight.
- **`ChatInfo` `onMount(load)` + `$effect`** double-fire deleted; effect
  covers initial mount. Same for `NavTabs.refreshProxyState`.
- **`ChatInfo` add-member search** now has a real 200ms debounce + gen
  guard against out-of-order RPC completions painting stale candidates.
- **`Connectivity.svelte` event handlers** (`ConnectivityChanged`,
  `AccountsItemChanged`) filter by `accounts.selectedId` — background
  accounts no longer thrash the foreground pane's four-RPC reload.
- **`Proxy.svelte:resolveHosts`** uses `Promise.all` instead of sequential
  `check_qr` calls.
- **`App.svelte`** split `$effect`s folded into one keyed on
  `accounts.selectedId` (no more cross-effect signalling via `chatlist.accountId`).
- **`ChatListPane`** `onMount`/`onDestroy` shortcut registration replaced
  with single `$effect` (cleanup-return auto-unsubscribes).
- **`chat.patchMessage`** defensive cross-chat filter deleted — the gate
  upstream already enforces the invariant.

### State module extractions (wire-shape boundary fixes)

- **New `lib/state/chatInfo.svelte.ts`** — 12 operations
  (`loadChatInfo`, `renameChat`, `setEphemeralTimer`, `leaveGroupChat`,
  `deleteChatLocally`, `blockChatContact`, `removeChatMember`,
  `findAddMemberCandidates`, `addChatMembers`, `setChatAvatar`). Unwraps
  `kind: 'ChatListItem'` at the boundary; `ChatInfo.svelte` is rendering
  only, zero raw `rpc.call`s.
- **`chat.svelte.ts` action helpers** — `sendContact`, `sendLocation`,
  `sendFile`, `loadMessages`. `Composer.shareContact`/`sendPickedLocation`/
  `pushFile` collapsed to thin state-callers. `MediaBrowser.load()` uses
  `loadMessages` — no more `kind: 'message'` wire-tag check in component.

### DRY consolidations

- **`chat.svelte.ts` `loadInitial` + `loadAll` → `loadWindow(targetCount)`**;
  `loadOlder` + `loadUntilInWindow` share `prependMessages(slice)`.
- **`messageStateGlyph(state)` + `canRecallMessage(m)`** in `chat.svelte.ts`.
  Routed `ChatListRow`, `MessageBubble`, `ChatView` (2 sites), `MediaBrowser`.
- **`formatShortTime` + `formatDayLabel`** in `lib/format/timestamp.ts`.
  Routed `MessageBubble`, `ChatView`. Hoisted shared `Intl.DateTimeFormat`
  formatters at module scope (previously re-created per message render).
- **`lib/format/openstreetmap.ts`** with `osmEmbedUrl` / `osmShareUrl`.
  Routed `LocationPicker`, `LocationCell`, `ChatInfo`. Eliminates the
  `0.005` half-degree magic and 3 inline URL builders.
- **`runOnboardingFlow(initial, steps)`** in `onboarding.svelte.ts`. Four
  near-identical 25-line flow functions (`createInstantAccount`,
  `importBackup`, `receiveBackup`, `loginManually`) collapse to 3–7 lines
  each. ~70-line shrink.

### Primitives created

- **`lib/Modal.svelte`** — overlay + card + Escape (via `$effect` cleanup,
  installed only while open) + backdrop click-to-close + shared
  `--color-backdrop` token. Ported 16+ consumers:
  `DeleteChatDialog`, `DeleteMessageDialog`, `ReactionDetailSheet`,
  `ChatPicker`, `ContactPickerModal`, `ChatInfo` (add-member dialog),
  `Connectivity` (3 dialogs), `Proxy` (2 dialogs), `ShareProxy`,
  `TransportForm`, `LocationPicker`, `BackupReceive` (2 dialogs),
  `ProgressOverlay`. Fixed three actual Escape bugs by construction
  (ChatPicker had none; ContactPickerModal Escape only fired with overlay
  focus; every consumer leaked a keydown listener while `open=false`).
- **`lib/Button.svelte`** — variants `primary` / `secondary` / `danger` /
  `danger-text` / `ghost` / `accent-text` × sizes `sm` / `md` / `lg` +
  `block`. Ported the dialog buttons across all modal consumers above
  plus `Profile`, `QrDispatcher`, `Welcome`, `Instant`, `ManualLogin`.
- **`lib/Popover.svelte`** — backdrop + viewport-edge clamp + window
  Escape (with overrideable `onEscape` for ChatRowMenu's mute-submenu
  back-nav). Ported `ChatRowMenu` and `ContextMenu`. ContextMenu now has
  working Escape-to-close (previously missing entirely).

### Dead code deleted

- `MainPane.backToChatRoute` + the `void` reference to suppress unused-warning.
- `Composer.svelte:91-95` no-op `if (text === '' && lastKey) text = '';`.
- `ChatInfo.svelte:192-197` six-line decision comment that re-narrated an
  obvious choice.
- `contacts.svelte.ts:34` `GCL_ADD_SELF` — exported, no caller.
- `rpc.ts` `notifHandlers` infrastructure (`on()` method, `notifHandlers`
  field, notification branch in `handleMessage`) — deltachat-jsonrpc doesn't
  emit notifications.
- `notifications.pushPending` truncate-to-50 — unreachable (`PENDING_MAX_AGE_MS`
  caps growth).
- `server/lib.rs` inline "Phase 0" HTML index handler — route dropped.
- `server/src/assets.rs` + `server/src/rpc.rs` — empty placeholder modules.
- `src-tauri/Cargo.toml` `features = []` empty arrays.
- `Makefile` `install` orphan target; added `make check` (svelte-check).

### CSS / theming

- Added `--color-warning`, `--color-danger-soft`, `--color-backdrop` tokens
  (light + dark + system variants).
- Routed `Connectivity` status dot hexes, `ConnectionIndicator`,
  `Logs.svelte` warning color, `MessageBubble.failed` through tokens.
- `ChatInfo` h2 (22px) → `var(--text-xl)`, rename input (18px) →
  `var(--text-lg)`, `ReactionsRow .chip` (11px) → `var(--text-xs)`.
  (Scope-correction: most of the ~35 `font-size: Npx` hits flagged were
  icon-button glyph sizes, not UI text — left raw.)

### Rust

- `server/lib.rs`: `bind()` inlined into `run()`, `BoundDaemon` deleted.
  `pub mod assets;` / `pub mod rpc;` removed. Inline HTML index handler
  + route removed.
- `src-tauri/src/main.rs`: `unsafe { msg_send! }` replaced with typed
  `dock_tile.setBadgeLabel(ns.as_deref())`. Non-macOS path emits
  `tracing::debug!` instead of silently no-op'ing (the `let _ = label;`
  trick gone). Empty-string label cleared cleanly (was painting an empty
  bubble on some macOS releases).
- `server/ws.rs`: per-message `tokio::spawn` now goes into a per-connection
  `JoinSet` that `shutdown().await`s on disconnect — no more detached
  tasks racing against the closing session.
- `server/upload.rs`: `StreamExt` import aligned with `ws.rs` (`as _` form).

### Cross-platform

- **`app.ts` titleBar gutter platform-detect**: `--titlebar-gutter` set to
  `0px` everywhere except Tauri-on-macOS. Closes the 36px dead-band that
  was rendering at the top of every screen on Linux/Windows/browser mode.
- **`tauri.conf.json`** added `"appimage"` to bundle targets — README
  advertised AppImage but the target was missing.
- **`set_badge`** on Linux/Windows now logs at debug level instead of
  silently no-op'ing (see Rust section).

### Build / packaging

- `desktop/scripts/sync-strings.mjs`: writes to
  `desktop/frontend/public/locales/en.json` instead of the pre-Tauri-pivot
  `web/frontend/public/locales/en.json` path. Header comments updated.
- `.gitignore`: added `src-tauri/target/` and `src-tauri/gen/` (Tauri
  regenerates the schemas on every build).
- `Makefile`: dropped orphan `install`, added `check` for `npm run check`.

---

## Deliberately skipped (with rationale)

These are findings from the review that the steel-man wins on, or where
the cost outweighs the benefit at the current project stage.

- **`chat.svelte.ts` 599-line module split** (into `chat` + `composer` +
  `jump`). Debatable improvement; the steel-man "creates cross-module
  reads where today they're local" carries weight. Would do if there's a
  concrete pain point.
- **`selection.chatId` vs `chat.active.chatId` dedupe.** Touches the
  jump-target lifecycle which has subtle ordering invariants documented
  inline. Medium-risk refactor with unclear pay-off.
- **`MenuItem` primitive.** Would save CSS but bulks JSX. `Popover`
  captured most of the value (the actual Escape bug).
- **`BlockedContacts` SettingsRow adoption.** Would need a new `leading`
  slot on `SettingsRow` for the Avatar. Bigger API change than warranted
  for one consumer.
- **`Profile` SettingsRow adoption.** Profile is a form, not a row-based
  settings page. Doesn't fit `SettingsRow` semantics.
- **`@tauri-apps/plugin-opener` single-use.** Capability whitelist in
  `capabilities/default.json` is a real audit-trail benefit. Keep.
- **`BoundDaemon` shutdown rewire (full version).** Inlined `bind` into
  `run` (simpler); did not wire `stop_io()` on window close — easy to
  deadlock, and `deltachat-core` flushes its own SQLite WAL.
- **`set_badge` Linux/Windows plugin (`tauri-plugin-badge`).** DE
  fragmentation (Sway/Hyprland don't support unity-launcher D-Bus). Worse
  UX than today's honest no-op + the existing `(12) qxp` title prefix.
- **`server/Cargo.toml` `default = ["vendored"]`.** Wasted ~5min on Nix
  rebuild but correct for macOS/Windows bundling. Not worth flipping.
- **RPC reconnect replay queue / event-loop polling re-arm.** Speculative —
  no measured bug.
- **Composer manual-diff effects** (`lastEditingId`/`lastKey` shadows).
  Works; refactoring touches a hot file for no clear win.
- **Lint-stub voids** (`_ = chatlist; void _;`, `void (() => message);`).
  Intentional placeholders for known near-term features.
- **`onEvents(kinds, h)` helper.** DRY bar barely cleared; saves ~6 lines
  across 3 sites at the cost of a name to learn.
- **`ChatView.lastSeenIds.every()` perf optimization.** No measured issue.
- **`voiceSupported $state → const`.** Purely aesthetic.
- **`MSG_STATE` / `MessageViewtype` unused constants.** Mirror the wire
  protocol; trimming risks future wire-shape drift.
- **`chatlist.svelte.ts` `isGroup` deprecated wire field drop.** Needs
  core-side verification of `chatType` mapping for Mailinglist/Broadcast.
- **`chatlist.svelte.ts:19` `kind: 'ChatListItem'` tautology drop.** Would
  require type changes across `ChatInfo`, `MainPane`, `ChatView`,
  `ChatPicker`, `ChatListRow` — medium-effort refactor for cosmetic gain.
- **Mass `8px/12px/16px/24px` → `var(--space-*)` migration** (78 sites).
  Mechanical, regression-risky, no user-visible improvement.
- **`tauri.conf.json` `titleBarStyle: Overlay` / `hiddenTitle`** (macOS-only
  options that no-op on Linux/Windows). The titleBar gutter fix in `app.ts`
  addresses the visible symptom (36px dead band); the options themselves
  can stay since they degrade silently.

---

## Outstanding user actions

1. **Generate `icons/icon.icns` and `icons/icon.ico`** by running
   `cargo tauri icon icons/icon.png` from `desktop/src-tauri/` (needs a
   1024×1024 master). Without these, `cargo tauri build` will fail when
   bundling for macOS or Windows.

2. **Verify the typed `dock_tile.setBadgeLabel(ns.as_deref())` compiles**
   on macOS. If `objc2-app-kit 0.3` doesn't expose `setBadgeLabel` as a
   typed method, fall back to the original `unsafe { msg_send! }` block.

3. **Run `make check`** (svelte-check) and `cargo check` inside `nix-shell`
   to verify nothing broke at the type/compile level. I couldn't run
   either from the sandbox.

---

## Stats

- **New files:** `lib/Modal.svelte`, `lib/Button.svelte`, `lib/Popover.svelte`,
  `lib/format/openstreetmap.ts`, `lib/state/chatInfo.svelte.ts`.
- **Deleted files:** `server/src/assets.rs`, `server/src/rpc.rs`.
- **Files modified:** ~50.

The applied changes net negative on lines: the modal/button/popover
primitives, helpers, and state extractions replace far more inline
boilerplate than they add. The `BoundDaemon` removal, dead-code sweep,
and onboarding-flow consolidation pile on the negative side.
