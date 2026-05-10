# PLAN: Push Notifications

## Context

Wake suspended/killed qxp clients on new mail so messages between qxp users feel like real-time push. The previous plan (`plans/notifications.md`) shipped local notifications + badges while the app is resident. This plan adds the APNs pipeline behind it.

Delta Chat's push protocol is a **silent-wakeup** design — the push payload carries no message content. iOS receives a content-available push, runs a Notification Service Extension (NSE), the NSE asks core to fetch IMAP, drains `DC_EVENT_INCOMING_MSG`, and posts user-visible banners locally. Core picks one of two transport paths per account:

- **Connected** — chatmail relays advertising `XDELTAPUSH`. Client stores its OpenPGP-encrypted APNs token in IMAP METADATA `/private/devicetoken` of INBOX. Relay forwards the blob to a notifier service when new mail arrives. Notifier decrypts, talks to APNs. Per-message wake.
- **Heartbeat** — non-chatmail providers (Gmail, etc.). Client POSTs the encrypted blob directly to `<notifier>/register`. Notifier sends silent pushes on a periodic schedule. Latency = heartbeat interval.

The notifier is a hard dependency: it owns the OpenPGP private key and the APNs auth key. Upstream's notifier (`notifications.delta.chat`) is bound to the official DC iOS bundle ID and won't deliver to ours. **Out-of-the-box DC push does not work for qxp.**

### Scope

- Push works between qxp users.
- qxp will operate its own chatmail relay on `qxp.chat` (which doubles as the marketing site) and its own notifier service on `notifications.qxp.chat`. Relay fork at `relay/`, notifier deploy scaffold at `notifier/` + `libs/notifiers/` (in-repo since 2026-05-04). Standing the live services up — APNs/OpenPGP secrets, `cmdeploy run` + `notifier/deploy.sh` — is a hard prereq for Phase 4 verification but not part of this plan's deliverables.
- Soft-cutover for existing `nine.testrun.org` users: they keep working as messaging accounts, get heartbeat-only push via the qxp notifier, and are nudged toward adding a qxp-relay account in account settings.

### Out of scope

- Federation / interop with `notifications.delta.chat`. Separate community-track effort.
- VoIP / CallKit (`DC_EVENT_INCOMING_CALL`). qxp has no calls UI.
- webxdc-notify banners (`DC_EVENT_INCOMING_WEBXDC_NOTIFY`). qxp doesn't render webxdc inline yet — banners would route to an attachment user can't open. Revisit when webxdc support lands.
- Mention-only banners for muted groups (`isMentionsEnabled`). Defer with the rest of per-account-settings.
- Custom notification sounds, action buttons, rich-content reply.
- BGTaskScheduler. Heartbeat covers the same ground; revisit only if heartbeat reliability disappoints.
- Migrating existing `nine.testrun.org` accounts via backup-transfer. Manual add-a-relay flow only.

### Constraints

- iOS 26+, Liquid Glass, no Swift/ObjC dependencies (CLAUDE.md).
- `libs/deltachat-core-rust` is forked. Core patches are maintained as commits on the submodule; xcframework rebuilt via the `builder` skill.
- I cannot run Xcode on this machine. New target/scheme creation in `qxp.xcodeproj`, capability toggles, and provisioning are the user's job; this plan prepares the source tree around them. See **Xcode wiring** below.
- App Group identifier: `group.chat.qxp` (already in use by main app + share extension). NSE will join.
- APNs token format: hex-encoded device token, prefixed with `sandbox:` in DEBUG builds (so the notifier can route to the right APNs environment). Mirrors the reference.

---

## Reference behaviour

Sources read: `references/deltachat-ios/DcNotificationService/NotificationService.swift`, `references/deltachat-ios/deltachat-ios/AppDelegate.swift` (push-related sections), `references/deltachat-ios/DcCore/DcCore/DC/DcAccount.swift`, `references/relay/chatmaild/src/chatmaild/notifier.py`, `references/relay/chatmaild/src/chatmaild/metadata.py`, `libs/deltachat-core-rust/src/push.rs`, `libs/deltachat-core-rust/src/imap.rs` (`register_token`).

**Token registration (DC iOS).** After `UNUserNotificationCenter.requestAuthorization` grants, `UIApplication.registerForRemoteNotifications()`. On `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`: hex-encode the bytes, prefix `sandbox:` under `#if DEBUG`, hand the string to `dcAccounts.setPushToken(token:)` (FFI: `dc_accounts_set_push_device_token`), then `dcAccounts.maybeNetwork()` to kick the IMAP loops to call `register_token`.

**Suspended-resident wakeup (DC iOS).** `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` calls `dc_accounts_background_fetch(timeout: 20)` from the main app; the existing event sinks (which already produce local notifications + badge updates) handle the fan-out.

**NSE flow (DC iOS, distilled from `NotificationService.swift`).**
1. Coordinate with main app via Darwin notifications + a `nseFetching` UserDefaults flag — abort with a silent notification if the main app is fetching this same account or another NSE invocation is already running.
2. `dcAccounts.openDatabase(writeable: false)`. Get an event emitter.
3. Arm a `DispatchSource.makeMemoryPressureSource(eventMask: .critical)` so an OOM-imminent state delivers a "best attempt" notification before the system kills the extension.
4. `dcAccounts.backgroundFetch(timeout: 25)` — blocking, drives IMAP across all accounts, returns when `DC_EVENT_ACCOUNTS_BACKGROUND_FETCH_DONE` fires or timeout elapses.
5. Drain the event emitter. For each event:
   - `DC_EVENT_INCOMING_MSG` → build `UNMutableNotificationContent` for the message.
   - `DC_EVENT_INCOMING_REACTION` → build content for the reaction.
   - `DC_EVENT_MSGS_NOTICED` → drop any queued notifications + remove already-delivered ones for that thread (handles "user opened the chat on another device").
6. Submit each `UNMutableNotificationContent` via `UNUserNotificationCenter.add`. Hand the system a final silent notification with `badge = dcAccounts.getFreshMessagesCount()` so the icon badge reflects reality. `closeDatabase`. Done.

Memory budget: NSE is capped at ~24 MB. Core's IMAP + SQLite easily fits if we don't load message bodies; the memory-pressure source is the safety net.

**Banner shape.** Per `UNMutableNotificationContent(forMessage:chat:context:)`:
- `title = chat.isMultiUser ? chat.name : sender.displayName`
- `body = (chat.isMultiUser ? "\(sender): " : "") + msg.summary(chars: 250)`
- `userInfo = ["account_id", "chat_id", "message_id"]`
- `threadIdentifier = "\(account_id)-\(chat_id)"` (so iOS groups + we can dismiss-by-thread)
- `sound = .default`
- Skipped entirely if chat or account is muted.

For reactions: `title = chat.name` (or sender for 1:1), `body = "\(reactor) reacted \(emoji) to: \(originalMsg.summary(chars: 100))"`. Dismiss-by-thread mirrors messages.

**Chatmail relay forwarding.** `chatmaild/notifier.py:71` hardcodes `URL = "https://notifications.delta.chat/notify"`. Operators patch this in their fork to point at the notifier they run. Token is opaque to the relay — relay just forwards the encrypted blob.

**Core dual-path logic.** `libs/deltachat-core-rust/src/imap.rs:1602-1695` (`register_token`): if relay has `XDELTAPUSH` + METADATA, run SETMETADATA path and set `push_subscribed = true`. Otherwise (else branch) spawn the heartbeat subscribe POST. Mutually exclusive in upstream.

---

## Phase 1: Core fork — notifier endpoint, key, and dual-register

**Goal:** Forked `libs/deltachat-core-rust` encrypts to qxp's notifier key, POSTs heartbeat to qxp's notifier URL, and registers via *both* SETMETADATA and heartbeat in parallel so users on a non-qxp chatmail relay still get heartbeat push as a fallback.

**Steps:**

1. **`libs/deltachat-core-rust/src/push.rs`** — replace `NOTIFIERS_PUBLIC_KEY` with the OpenPGP public key generated for qxp's notifier (server-side artefact, see **Server-side prerequisites**). Replace the `https://notifications.delta.chat/register` URL with qxp's notifier register endpoint.

2. **`libs/deltachat-core-rust/src/imap.rs`** in `register_token` — change the `else if` to `if` so the heartbeat subscribe runs *in addition to* SETMETADATA, not as a fallback. SETMETADATA gives instant push when the relay is qxp's; heartbeat covers everyone else (including users still on `nine.testrun.org` after our cutover).

3. **Rebuild xcframework** via the `builder` skill. Pin the resulting commit on the submodule. The patched core stays as a tiny, easy-to-rebase delta on top of upstream.

4. **Document the patch** — a `libs/deltachat-core-rust-patches/README.md` describing the three-line diff so it can be re-applied on the next core bump. (`builder` skill produces a clean cross-rebase workflow.)

**Verification:** Build succeeds. Existing tests pass. New `qxp/Core/DcAccounts.swift` API call (Phase 2) compiles and links.

**Note:** Upstream's `dc_get_push_state` returns `Connected` once SETMETADATA succeeds, even if heartbeat also succeeded. With dual-register, the value can be misleading on non-qxp relays (relay forwards undecryptable blobs to delta.chat's notifier, push fails silently, but state still reads `Connected`). UI in Phase 5 compensates with a relay allow-list.

---

## Phase 2: Core wrappers + push events

**Goal:** Swift API surface for the FFI calls and constants needed by Phases 3–5.

**Steps:**

1. **`qxp/Core/DcAccounts.swift`** — add:
   - `func setPushDeviceToken(_ token: String)` → wraps `dc_accounts_set_push_device_token`.
   - `func backgroundFetch(timeout: UInt64) -> Bool` → wraps `dc_accounts_background_fetch`. Returns `true` iff `DC_EVENT_ACCOUNTS_BACKGROUND_FETCH_DONE` was emitted (i.e. fetch completed cleanly, not timed out).
   - `func stopBackgroundFetch()` → wraps `dc_accounts_stop_background_fetch`. Used by NSE on `serviceExtensionTimeWillExpire`.

2. **`qxp/Core/DcContext.swift`** — add:
   - `var pushState: PushState` → wraps `dc_get_push_state` (returns `.notConnected | .heartbeat | .connected`).
   - Define `PushState` as a small `Int8`-backed `enum` matching `DC_PUSH_*` (`0`, `1`, `2`).

3. **`qxp/Core/DcConstants.swift`** — add `DC_EVENT_ACCOUNTS_BACKGROUND_FETCH_DONE = 2200` near the other event IDs.

4. **`qxp/Core/DcEventLog.swift`** — add a log line for `2200` (matches the existing pattern for other event IDs).

5. **No event-bus wiring** for `2200` — the NSE consumes it inline via the event emitter; the main app doesn't need to react.

**Verification:** Compiles. No behavior change.

---

## Phase 3: APNs registration + suspended-resident wakeup

**Goal:** Main app registers with APNs after auth grant, hands the token to core, and handles silent pushes that arrive while the app is suspended-but-resident. NSE absent — push works, but only while iOS hasn't jetsam'd the app.

**Steps:**

1. **`qxp/qxp.entitlements`** — add `aps-environment` key. Value is `development` for DEBUG and gets swapped to `production` automatically by Xcode at archive time when the AppID is enrolled.

2. **`qxp/Info.plist`** — add `UIBackgroundModes = [remote-notification]`. (`fetch` is intentionally absent — heartbeat-via-notifier obsoletes legacy background-fetch wakeup.)

3. **`qxp/State/LocalNotificationCenter.swift`** — after `UNUserNotificationCenter.requestAuthorization` grants, hop to the main thread and call `UIApplication.shared.registerForRemoteNotifications()`. On denial, no-op (heartbeat-only sub still works in-app for foreground).

4. **`qxp/qxpAppDelegate.swift`** — implement:
   - `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`: hex-encode bytes, prefix `sandbox:` under `#if DEBUG`, call `appState.accounts.setPushDeviceToken(_:)`, then `appState.accounts.maybeNetwork()` to kick the IMAP loops.
   - `application(_:didFailToRegisterForRemoteNotificationsWithError:)`: `logger.error`, no-op otherwise.
   - `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`: if foreground or NSE flag set, call completion `.newData` and bail. Else `DispatchQueue.global().async`, set `mainIoRunning` UserDefaults flag, call `appState.accounts.backgroundFetch(timeout: 20)`, hand `.newData`, clear the flag. The existing event sinks already produce banners + badges.

5. **`qxp/Core/AppGroup.swift`** — add a `UserDefaults` accessor for cross-process flags (`mainIoRunning`, `nseFetching`). Lives in the App Group's shared `UserDefaults(suiteName: AppGroup.identifier)` so the NSE in Phase 4 can read it. Two simple `static func` helpers: `setMainIoRunning(_ on: Bool)`, `var nseFetching: Bool`.

**Verification:** Real device with the AppID push-enrolled. Killing then re-launching the app should show "Notifications: Token: <hex>" in console. Sending a message from another qxp client to this account, with the app suspended (home button, *not* swiped away), should produce a banner within seconds. App swiped-away → no banner yet (NSE absent). `dc_get_push_state` returns `.connected` for accounts on the qxp relay, `.heartbeat` for accounts elsewhere.

---

## Phase 4: `qxpNSE` extension target

**Goal:** NSE target that wakes from any state (including jetsam-killed app), fetches via core, and posts banners for incoming messages and reactions. This is when push becomes "real."

**Steps:**

1. **Shared banner builder** — `qxp/Core/NotificationContent.swift` (new, `nonisolated`, multi-targeted with NSE *and* main app):
   - `extension UNMutableNotificationContent` with two convenience initializers: `init?(forMessage: DcMsg, chat: DcChat, context: DcContext)` and `init?(forReaction emoji: String, from contactId: UInt32, msg: DcMsg, chat: DcChat, context: DcContext)`. Both honour the muting rules (account-mute deferred → just chat-mute), populate `userInfo`, `threadIdentifier`, `relevanceScore`, `sound`. Returns nil to skip.
   - `qxp/State/LocalNotificationCenter.swift` is refactored to call into this builder — same banners whether posted from main-app foreground or from NSE.
   - `LocalNotificationCenter` also gains a subscription to `DC_EVENT_INCOMING_REACTION` so foreground reactions banner too. Mirrors the structural hook noted in `plans/notifications.md`'s "Open questions / deferred."

2. **`qxpNSE/` directory** — files written to disk:
   - `NotificationService.swift` — `UNNotificationServiceExtension` subclass. `didReceive` body mirrors the reference distilled flow: Darwin/UserDefaults handshake, abort-if-main-fetching, `dcAccounts.openDatabase(writeable: false)`, memory-pressure source, `backgroundFetch(timeout: 25)`, drain emitter, build `UNMutableNotificationContent`s for `INCOMING_MSG` + `INCOMING_REACTION`, dismiss thread on `MSGS_NOTICED`, hand a silent tombstone with badge to `contentHandler`. `serviceExtensionTimeWillExpire` calls `dcAccounts.stopBackgroundFetch()` and lets the in-flight content go through.
   - `Info.plist` — `NSExtensionPointIdentifier = com.apple.usernotifications.service`, `NSExtensionPrincipalClass = $(PRODUCT_MODULE_NAME).NotificationService`.
   - `qxpNSE.entitlements` — `com.apple.security.application-groups = [group.chat.qxp]` and `com.apple.developer.usernotifications.filtering = true` (lets us deliver a silent tombstone with badge-only content for the no-new-messages case).
   - `Bridging-Header.h` — `#include <deltachat.h>`.

3. **No NSE-specific UI logic** beyond the shared banner builder — keep the extension as small as possible to stay under the 24 MB cap.

4. **Coordination flags** — UserDefaults in the App Group container:
   - `mainIoRunning` — main app sets this around its background-fetch in Phase 3. NSE bails if true.
   - `nseFetching` — NSE sets this with a TTL on entry. Main app's `didReceiveRemoteNotification` bails if true (main is in foreground anyway, so this is rare).
   - Darwin notification `appRunningQuestion` / `appRunningConfirmation` — NSE sends a question, main app (if alive) replies. NSE bails on confirmation. Mirrors `DarwinNotificationCenter` from the reference but stripped to two messages.

**Verification:** Real device, with qxp relay + qxp notifier infra live. Kill (swipe-away) the qxp app. Send a message from another qxp client. Banner appears within ~1s on the connected path. Tap → cold-launches qxp into the chat. Send a reaction → reaction banner. Open the chat on a second device → `DC_EVENT_MSGS_NOTICED` should remove the delivered notification on the first device on next NSE wake-up.

---

## Phase 5: Default-relay swap + per-account push-state UI

**Goal:** New users land on the qxp relay (so they get connected push). Existing users see honest per-account push state and a clear path to add a qxp-relay account.

**Steps:**

1. **`qxp/Core/DcConstants.swift`** — change `defaultChatmailDomain` from `"nine.testrun.org"` to `"qxp.chat"`. New instant-onboarding accounts get `<random>@qxp.chat` addresses.

2. **`qxp/Core/DcConstants.swift`** — add a new `qxpRelayDomains: Set<String>` allow-list (initially `["qxp.chat"]`; structured to grow if more relays are added later). Used by Phase-5 UI to render honest push-state strings.

3. **`qxp/Core/DcContext.swift`** — add `var isOnQxpRelay: Bool` → checks the configured `addr` against `qxpRelayDomains`. Cheap.

4. **`qxp/State/AppState.AccountInfo`** — extend with `pushState: PushState` and `isOnQxpRelay: Bool`. Populated in `allAccounts()` from the per-context lookups. Used by `ProfilesView` and account settings.

5. **Account settings — push status row.** New row in the per-account profile view:
   - `Connected` + `isOnQxpRelay` → "Instant push" (subtitle: "Notifications arrive immediately.")
   - `Connected` *or* `Heartbeat`, `!isOnQxpRelay` → "Periodic push" (subtitle: "Notifications arrive within a few minutes. Switch to a qxp relay for instant push." with an inline action that adds-a-qxp-relay-account.)
   - `NotConnected` → "Push unavailable" (subtitle: "Enable notifications in iOS Settings.")
   Renders inside the existing account-settings list — no new screen.

6. **One-shot soft nudge.** First time `MainTabBarController` boots with at least one logged-in account on a non-qxp relay, post a single in-app banner (using qxp's existing `Banner` style — *not* a notification) suggesting "Add a qxp relay for instant notifications." Persist a `softCutoverNudgeShown` flag in `UserDefaults` so it doesn't repeat.

7. **`AboutView.swift` copy update.** The current "Chatmail relays and chatmail clients are interchangeable" framing is still true for messaging. Add a sentence: "Push notifications work best on a qxp relay; on other relays they may be delayed." Honest, doesn't oversell.

**Verification:** Fresh install → onboarding lands on qxp relay → push state shows "Instant push." Existing account on `nine.testrun.org` → "Periodic push" with the action button. Account on Gmail → "Periodic push" (heartbeat is honest there). Permission denied in Settings → "Push unavailable."

---

## Xcode wiring (do this on the Mac)

The Swift, plist, and entitlements files are on disk. Xcode steps:

### A. Apple Developer portal

1. Enable **Push Notifications** capability for the qxp AppID (`chat.qxp`). Generate an APNs auth key (one `.p8` for the team) — hand it to whoever runs the qxp notifier.
2. Refresh the main-app provisioning profile. (Xcode's automatic signing usually handles this.)
3. Create a new AppID for `chat.qxp.qxpNSE`. Enable App Groups + Push Notifications. (Push capability not strictly required on the NSE AppID — silent notifications are filtered by the main-app entitlement — but enable it so the provisioning profile gets the group.)

### B. Main-app target (`qxp`)

1. **Signing & Capabilities → qxp:** turn on **Push Notifications**. Verify **Background Modes** has **Remote notifications** ticked.
2. **Add to target membership** (file inspector):
   - `qxp/Core/NotificationContent.swift` (also for qxpNSE — see C below).
3. Build. Console should print "Notifications: Token: <hex>" on first launch after granting permission.

### C. Create the `qxpNSE` extension target

1. **File → New → Target → "Notification Service Extension"**. Product Name `qxpNSE`, language Swift, embed in `qxp`. Deployment target iOS 26.
2. **Delete the auto-generated** `qxpNSE/NotificationService.swift` and `qxpNSE/Info.plist` from disk *and* the project navigator.
3. **Drag in the prepared files** from `qxpNSE/`:
   - `NotificationService.swift` (qxpNSE target only)
   - `Info.plist` (qxpNSE target — set as the Info.plist in build settings)
   - `qxpNSE.entitlements` (qxpNSE target — set `CODE_SIGN_ENTITLEMENTS`)
   - `Bridging-Header.h` — set `SWIFT_OBJC_BRIDGING_HEADER = qxpNSE/Bridging-Header.h` for the qxpNSE target.
4. **Multi-target membership** — tick **qxpNSE** (in addition to qxp) for these existing files:
   - `qxp/Core/AppGroup.swift`
   - `qxp/Core/Logger.swift`
   - `qxp/Core/DcAccounts.swift`
   - `qxp/Core/DcContext.swift`
   - `qxp/Core/DcChat.swift`
   - `qxp/Core/DcMsg.swift`
   - `qxp/Core/DcContact.swift`
   - `qxp/Core/DcLot.swift`
   - `qxp/Core/DcConstants.swift`
   - `qxp/Core/DcEventLog.swift`
   - `qxp/Core/NotificationContent.swift`
5. **Frameworks & Libraries (qxpNSE target):** **Do Not Embed** for `libs/libdeltachat.xcframework`, `SystemConfiguration.framework`, `Security.framework`. Regular link for `UserNotifications.framework`.
6. **Signing & Capabilities → qxpNSE:** turn on **App Groups**, tick `group.chat.qxp`. The `usernotifications.filtering` entitlement isn't a UI toggle; it's only in the entitlements plist — Xcode reads it from there.
7. **Build Settings → qxpNSE:**
   - `IPHONEOS_DEPLOYMENT_TARGET = 26.0`
   - `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (matches main app)
   - `SWIFT_VERSION = 6.0`
   - `ENABLE_USER_SCRIPT_SANDBOXING = YES` (default)

### D. Verify

Build the qxp scheme + qxpNSE scheme. Expected:
- Both build clean.
- On a real device, killing qxp and sending a message from another qxp account produces a banner within ~1 s (qxp-relay path) or within heartbeat interval (other relays).
- Tapping a banner cold-launches qxp into the right chat.

---

## Server-side prerequisites

Two services co-located on a single VPS (`root@qxp.chat`):

**`qxp.chat`** — chatmail relay. Fork lives at `relay/` (qxp branch on `codeberg.org/qxp/relay`). Single one-line patch in `chatmaild/src/chatmaild/notifier.py` redirects the per-message `/notify` forward at `https://notifications.qxp.chat/notify`. Otherwise stock chatmail; deployed via `cmdeploy run`. Doubles as the marketing site.

**`notifications.qxp.chat`** — notifier, **unmodified upstream [chatmail/notifiers](https://github.com/chatmail/notifiers)** (Apache 2.0, Rust). Source at `libs/notifiers/` (submodule, pinned at `8324bf16`). Deployment scaffold at `notifier/` (commit `67a44e6`, 2026-05-04): `deploy.sh` (local driver), `remote-deploy.sh` (root on the box), `notifier.service` (hardened systemd unit), `qxp-notifier-launch` (wrapper that injects `--password` from a 0600 file), `nginx-vhost.conf` (reverse proxy on `127.0.0.1:8443` → `:9000`), `README.md` (full runbook).

`notifier/deploy.sh` is idempotent and must be re-run after every `cmdeploy run` — cmdeploy rewrites `/etc/nginx/nginx.conf` and removes the include directive that activates our vhost. Everything else (binary, secrets, systemd unit, vhost file, certs, DB) survives.

Endpoints: `POST /register` (heartbeat subscription, hit by qxp clients on non-chatmail providers) and `POST /notify` (per-message forward, hit by the relay). Both accept `{"token": "<openpgp-encrypted-blob>"}`. `--topic chat.qxp` is load-bearing — it's the APNs apns-topic and must match the main-app `CFBundleIdentifier` exactly.

### Pending before push works end-to-end

1. **Apple Developer portal**: register AppIDs `chat.qxp` (Push + App Groups) + `chat.qxp.qxpShare` (App Groups), App Group `group.chat.qxp`. Refresh provisioning profiles.
2. **OpenPGP keypair** via `rsop generate-key --profile rfc9580` → `~/.qxp-secrets/notifier.{privkey,pubkey}`. Privkey deploys with the notifier; pubkey gets baked into core in Phase 1 of this plan. **Treat the privkey as a root secret** — loss means push breaks for every installed qxp build until a new client ships with a new pubkey.
3. **APNs `.p12`** from Mac Keychain after `chat.qxp` is push-enrolled → `~/.qxp-secrets/apns.p12` + `~/.qxp-secrets/apns-password`. Renews yearly.
4. **`./notifier/deploy.sh`** from repo root. See `notifier/README.md` for the full bootstrap walkthrough.

---

## Open questions / deferred

- **`dc_get_push_state` honesty on non-qxp chatmail relays.** Core reports `Connected` after a successful SETMETADATA even though the relay forwards to a notifier that can't decrypt our blobs. Phase 5 papers over this with the relay allow-list. Cleanest long-term fix: extend the patch to expose a fourth state ("subscribed via SETMETADATA but to a non-qxp notifier") or rely on a delivery receipt from our notifier. Defer.
- **Account migration.** Soft-cutover assumes users add a qxp-relay account next to their existing `nine.testrun.org` account; old contacts won't auto-migrate. A backup-transfer-style flow (`plans/connectivity.md`) could one day move chats across. Not worth blocking push on it.
- **webxdc-notify banners.** Plumbed at the event-handler level in `DcEventLog.swift`, but not built into `NotificationContent.swift`. Add when webxdc gets first-class rendering.
- **CallKit / VoIP push.** `DC_EVENT_INCOMING_CALL` exists; reference uses `CXProvider.reportNewIncomingVoIPPushPayload`. Picks up when qxp gains a calls UI.
- **Mention-only banners in muted groups.** Reference reads `isMentionsEnabled`. Do once we have per-account/per-chat notification settings.
- **Token rotation.** Core sets `heartbeat_subscribed = true` after first POST and never re-POSTs in that session. iOS APNs token rotation while the app is running would silently leave the notifier holding a stale token until next launch. Probably fine; flag if real-world reports surface.
