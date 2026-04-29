# PLAN: Local Notifications + Unread Badges

## Context

The app already knows about every fresh (unread) message on every configured account: the core multiplexes IO across accounts on a single event loop and `DC_EVENT_INCOMING_MSG` fires for the current *and* every non-selected account. We just don't surface that knowledge.

This plan wires up everything that is achievable **without** an APNs push pipeline:

**In scope:**
- App-icon badge with the cross-account total of fresh, unmuted messages.
- UIKit tab-bar badges:
  - **Chats** tab: fresh count for the *current* account (so a user sitting on the Profiles tab still sees activity on the account they're signed into).
  - **Profiles** tab: fresh count summed across all *other* accounts (so a user sees that another profile got a message).
- Local user-notification banner on every `DC_EVENT_INCOMING_MSG` while the app process is alive (covers: user is in another tab, or has just re-foregrounded the app and core is replaying just-fetched messages).
- One-time authorization request for `[.alert, .sound, .badge]` after the first successful login.
- Auto-clearing notifications and per-chat badge contribution when the user opens a chat / marks-noticed.

**Not in scope (deferred):**
- APNs / silent-push pipeline — needs a notify-token relay server and a `dc_set_push_device_token` call. Tracked separately.
- Notification Service Extension (NSE) for fetch-on-push when the process is suspended.
- Per-chat / per-account notification settings UI.
- Notification grouping summary view, custom sounds, action buttons (reply/mark-read).
- Live-activity / Dynamic Island.
- Background fetch (`BGAppRefreshTask`) — IO still only runs while `scenePhase == .active`. Background message arrival therefore won't badge until the next foreground.

## Reference behaviour

`references/deltachat-ios/deltachat-ios/Helper/NotificationManager.swift` is the canonical implementation. Distilled:

1. **Cross-account total** (`DcAccounts.getFreshMessagesCount(skipCurrent:)`) iterates `getAll()`, calls `dc_get_fresh_msgs` per account, sums *unless* the account itself is muted (`ui.account.muted` config). Optionally skips the selected account (used when populating "other accounts have unread" indicators).
2. **Per-account total** (`DcContext.getFreshMessagesCount`) wraps `dc_get_fresh_msgs` + `dc_array_get_cnt`. Already skips per-chat-muted chats (the core does this in `dc_get_fresh_msgs`, see `deltachat.h:1944`).
3. **`updateBadgeCounters(forceZero:)`** is called from every event sink that could change the unread state. It writes:
   - `UIApplication.shared.applicationIconBadgeNumber` (deprecated on iOS 17+).
   - `chatsNavigationController.tabBarItem.badgeValue = number > 0 ? "\(number)" : nil`.
4. **Incoming-message handler** posts a `UNMutableNotificationContent` built from `(msg, chat, context)`:
   - Skipped if the account or chat is muted (with a mention exception in groups).
   - `title = chat.isMultiUser ? chat.name : sender`.
   - `body = (chat.isMultiUser ? "\(sender): " : "") + msg.summary(chars: 250)`.
   - `userInfo = ["account_id", "chat_id", "message_id"]` (used to dismiss when the chat opens).
   - `threadIdentifier = "\(account_id)-\(chat_id)"` so iOS groups them per chat.
   - `relevanceScore` set from pinned/mention/muted/multi-user state.
5. **Open-a-chat clears** delivered notifications matching that account+chat via `removeDeliveredNotifications(withIdentifiers:)`, and re-runs `updateBadgeCounters`.
6. **Authorization request** lives in `AppDelegate.registerForNotifications` — `requestAuthorization(options: [.alert, .sound, .badge])` then `registerForRemoteNotifications`. We keep the auth request, drop the remote-registration step.

---

## Phase 1: Core layer additions

**Goal:** Expose the cross-account and per-account fresh-message counts in our Swift wrapper layer.

### Steps

1. **`qxp/Core/DcContext.swift`** — add:
   ```swift
   func getFreshMessagesCount() -> Int {
       guard let arr = dc_get_fresh_msgs(handle) else { return 0 }
       defer { dc_array_unref(arr) }
       return Int(dc_array_get_cnt(arr))
   }
   ```
   Note: this is the per-*account* count (already filters muted chats). Distinct from the existing `getFreshMsgCount(chatId:)` (per-chat).

2. **`qxp/Core/DcAccounts.swift`** — add:
   ```swift
   func getFreshMessagesCount(skipCurrent: Bool = false) -> Int {
       let skipId: UInt32? = skipCurrent ? getSelected()?.id : nil
       return getAll().reduce(0) { acc, id in
           guard id != skipId, let ctx = get(id: id) else { return acc }
           return acc + ctx.getFreshMessagesCount()
       }
   }
   ```
   No account-level "muted" check — qxp does not yet expose an `ui.account.muted` toggle, so this matches our model. (Adding per-account mute is a separate plan if ever needed.)

3. **`qxp/State/AppState.AccountInfo`** — extend with `unreadCount: Int`. Populate in `allAccounts()` from `ctx.getFreshMessagesCount()`. Used by Phase 2 to render a per-row unread badge in `ProfilesView` and to drive the Profiles-tab badge.

### Verification
- Unit: with two accounts, send a message to the non-selected one; `accounts.getFreshMessagesCount()` returns 1, `getFreshMessagesCount(skipCurrent: true)` returns 1, current account's `getFreshMessagesCount()` returns 0.
- Mark the chat as noticed; both go to 0.

---

## Phase 2: Badge coordinator

**Goal:** A single source of truth that, on relevant events, refreshes app-icon + tab-bar badges. No notification authorization required for tab-bar badges; the app-icon badge degrades gracefully if auth is denied (write is a no-op without `.badge`).

### Steps

1. **Create `qxp/State/BadgeCoordinator.swift`** — `@MainActor` class owned by `MainTabBarController` (alongside the router wiring). Holds weak refs to the chats-tab and profiles-tab `UINavigationController`s. Subscribes to `appState.events` and recomputes on:
   - `.incomingMsg`, `.incomingMsgBunch`, `.msgsChanged`, `.msgsNoticed`, `.msgRead`, `.msgDeleted`, `.chatModified`, `.chatDeleted`.
   - `.contactsChanged` (fired by `switchAccount` to force a profile-tab redraw).

   `refresh()`:
   ```swift
   let total = accounts.getFreshMessagesCount()
   let other = accounts.getFreshMessagesCount(skipCurrent: true)
   let current = total - other
   chatsTabItem.badgeValue = current > 0 ? "\(current)" : nil
   profilesTabItem.badgeValue = other > 0 ? "\(other)" : nil
   UNUserNotificationCenter.current().setBadgeCount(total) // iOS 16+ API
   ```

2. **`MainTabBarController.viewDidLoad`** — instantiate `BadgeCoordinator`, hand it the two nav controllers, store on the controller, kick a `refresh()` after `viewControllers = [...]` so the initial state on launch reflects whatever fresh messages already exist in the DB.

3. **Per-account unread pill in `ProfilesView`** — add a small UIKit-style count to `ProfileRow` when `info.unreadCount > 0`. Use a capsule background tinted with `.tint`. Mirror the chat list's existing unread-pill styling (see `ChatListRow`'s `unreadCount` rendering for shape).

### Verification
- Cold start with one fresh message: app-icon badge `1`, chats-tab badge `1`, profiles-tab badge nil.
- Switch to a second account that has 2 fresh: app-icon `3`, chats-tab `2`, profiles-tab `1` (the previous account).
- Open the chat → marknoticed fires → all three drop accordingly.
- Lock-screen view shows the icon badge.

---

## Phase 3: Local notifications

**Goal:** A foreground / mid-session banner when a new message arrives in a chat the user isn't currently viewing.

### Steps

1. **Create `qxp/State/LocalNotificationCenter.swift`** — `@MainActor` actor / class with three responsibilities:
   - **Authorization** (`requestAuthorization()`): single-shot `UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])`. Persist a `UserDefaults` flag `notifications.requestedAuth` so we don't re-prompt on every launch (iOS itself only shows the system dialog once anyway, but the flag lets us avoid the no-op call).
   - **Post on incoming** (`postIfNeeded(event:)`): for `incomingMsg`, look up the message + chat + context via `DcAccounts.get(id:)` (the event carries the account ID, which may differ from `appState.context`). Build a `UNMutableNotificationContent` mirroring the reference's `(forMessage:chat:context:)` initializer:
     - Skip if `chat.isMuted` (and not a self-mention, deferred — keep it simple: muted = no banner).
     - Skip if the chat is currently *visible* (i.e. user has the corresponding `ChatViewController` on top *and* the app is foregrounded). Read this from `NavigationRouter` (already tracks the chat-stack root).
     - `title`, `body`, `userInfo`, `threadIdentifier` per the reference layout.
     - `sound = .default`.
     - Submit via `UNNotificationRequest(identifier: UUID().uuidString, content:, trigger: nil)` so the banner fires immediately.
   - **Clear on chat-open / marknoticed** (`clearForChat(accountId:chatId:)`): `getDeliveredNotifications` → filter by `userInfo` keys → `removeDeliveredNotifications(withIdentifiers:)`.

2. **Wire into `AppState`** — instantiate the center in `init()`, kick `requestAuthorization()` from `handleConfigureProgress` once `progress == 1000` (covers both manual login and instant onboarding) and once at `initialize()` end if the account is already configured (covers second-launch).

3. **Subscribe to events** — inside the center, `appState.events.sink` for:
   - `.incomingMsg` → `postIfNeeded`.
   - `.msgsNoticed` → `clearForChat(accountId: event.accountId, chatId: UInt32(event.data1Int))`.
   The center holds a `cancellable` and a weak ref to `appState` for context lookup.

4. **Open-chat clears** — `NavigationRouter.pushChat(id:)` already runs whenever the user enters a chat. Add a hook there (or in `ChatViewModel.load()`) that calls `appState.localNotifications.clearForChat(accountId: appState.context.id, chatId: chatId)`. The `.msgsNoticed` event from `dc_marknoticed_chat` will also fire and clear via the event path; the explicit call is just an immediate-feedback shortcut.

5. **UNUserNotificationCenter delegate** — qxp currently has no `UIApplicationDelegate`. SwiftUI-only apps can install one via `@UIApplicationDelegateAdaptor`. Add a minimal `qxpAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate`:
   - In `application(_:didFinishLaunchingWithOptions:)`: `UNUserNotificationCenter.current().delegate = self`.
   - In `userNotificationCenter(_:willPresent:withCompletionHandler:)`: return `[.banner, .sound, .badge]` so foreground notifications still draw a banner (default behavior is to suppress).
   - In `userNotificationCenter(_:didReceive:withCompletionHandler:)`: read `userInfo`, switch the selected account if needed (`AppState.switchAccount(id:)`), then `appState.openChat(id:)`. Mirrors `ChatViewController` deep-link behavior.
   Mount in `qxpApp` via `@UIApplicationDelegateAdaptor(qxpAppDelegate.self) private var appDelegate`.

### Verification
- Send a message from another DC client to the current account while qxp is on the Profiles tab → banner appears, tap → routes into the chat, banner clears.
- Send to a non-selected account → banner with that chat's name, profiles-tab badge increments, app-icon badge increments.
- Mute a chat → no banner, badges still update (Delta Chat keeps muted-chat fresh count visible in-app).
- Deny notification permission in Settings → app-icon badge stops updating, tab-bar badges keep working.

---

## Open questions / deferred

- **Background message arrival.** Without push (or background fetch), a message arriving while the app is suspended won't badge or notify until the user re-opens the app. The next plan in this sequence sets up APNs + NSE so the icon badge reflects reality without launching the app. Tracked separately.
- **Per-account mute (`ui.account.muted`).** Reference exposes a global "mute all of this profile" toggle distinct from per-chat muting. Skip until a notifications-settings screen is on the table.
- **Reactions (`incomingReaction`) and webxdc-notify banners.** Both are separate event types in core. Plumb when reactions/webxdc UX lands; the `LocalNotificationCenter` is structured to grow into them via a `postIfNeeded(forReaction:…)` / `postIfNeeded(forWebxdcNotify:…)` overload.
- **Mention-only group banners.** Reference allows muted multi-user chats to still notify on self-mentions (`isMentionsEnabled` config). Defer with the rest of the per-account settings.
- **Notification UI customization** (sounds, action buttons, rich-content reply): out of scope.
