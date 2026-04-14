# PLAN: QR Code tab — show · scan · share · paste

## Context

The MVP exposes a single `ScanQrView` wired only into onboarding (`.setProvider`, `.receiveBackup`). Once a user is logged in there is no surface at all for the everyday QR actions the reference client hangs off its QR tab: *showing your own invite QR*, *scanning a peer's contact / group / invite QR to start a verified chat*, *copy / paste / share the invite link*, and *withdraw / revive your own QR*.

This plan adds a third tab ("QR") to `MainTabView` with a segmented **Show** / **Scan** split, and broadens the shared scanner so it handles the full set of `DC_QR_*` outcomes — not just the two onboarding sub-cases.

**In scope:** show own setup-contact QR (`chat_id = 0`), render as image + caption, share the invite URL via `UIActivityViewController`, copy + paste, withdraw/revive; scan any peer QR and dispatch via `dc_check_qr` to the right terminal action (join securejoin, open chat by contact, open URL, show text, toggle own QR state, or polite rejection for onboarding-only codes).

**Out of scope:** group-QR show (we have no group UI yet — only Setup-Contact for `chat_id = 0`); proxy configuration UI (alert-only); WebRTC-instance config (alert-only); new-classic-contact (non-chatmail flow) — the reference surfaces it here but our MVP has no such view yet, so we skip it.

**Server question (explicit):** we do **not** stand up a qxp-side service for the share link. `dc_get_securejoin_qr` already returns a shareable `https://i.delta.chat/#…` URL — i.delta.chat is a stateless Delta Chat–operated redirector that deep-links into any DC client (or falls back to install instructions). Using it costs us nothing and matches the reference behaviour. Documented in M2.

## Reference behaviour (observed, not copied)

Read from `resources/deltachat-ios/deltachat-ios/Controller/{QrPageController,QrViewController,QrCodeReaderController}.swift`:

- **`QrPageController`** — `UIPageViewController` in the title segmented control swap between `QrViewController` (show) and `QrCodeReaderController` (scan). Toolbar `ellipsis.circle` menu: **Share**, **Copy**, **Paste** (paste is present in both tabs and routes through the scan coordinator), **Withdraw QR** (only in Show). Share / copy both call `Utils.getInviteLink(context:chatId:)`, which is literally `context.getSecurejoinQr(chatId:)` — so the QR payload *is* the invite link.
- **`QrViewController`** — renders the securejoin QR (SVG via `dc_get_securejoin_qr_svg`, deprecated), a caption `qrshow_join_contact_hint` formatted with the user's display name / email, a "Share invite link" text button below.
- **`QrCodeReaderController`** — thin wrapper around `AVCaptureSession`; on any detected string it calls `AppCoordinator.coordinate(qrCode:from:)` which routes via `dc_check_qr`. The dispatch table mirrors what `dc_check_qr`'s doc comment (deltachat.h §2546–2620) prescribes:
  - `DC_QR_ASK_VERIFYCONTACT` (200) → confirm → `dc_join_securejoin` → resulting chat.
  - `DC_QR_ASK_VERIFYGROUP` (202) / `_VERIFYBROADCAST` (204) → same path.
  - `DC_QR_FPR_OK` (210) / `_MISMATCH` (220) / `_WITHOUT_ADDR` (230) → informational alert.
  - `DC_QR_ADDR` (320) → confirm → `dc_create_chat_by_contact_id(lot.id)`.
  - `DC_QR_TEXT` (330) → alert with copy action.
  - `DC_QR_URL` (332) → confirm → `openURL(lot.text1)`.
  - `DC_QR_ACCOUNT` (250) / `LOGIN` (520) / `BACKUP2` (252) / `BACKUP_TOO_NEW` (255) → "already logged in / not applicable" alert.
  - `DC_QR_PROXY` (271) → reference shows an add-proxy confirmation. We alert-only (deferred).
  - `DC_QR_WITHDRAW_*` (500/502/504) / `DC_QR_REVIVE_*` (510/512/514) → `dc_set_config_from_qr(qr)` to flip own-QR state, show confirmation. For contact-verify (own QR), rerender the displayed QR afterwards.
  - `DC_QR_ERROR` (400) → alert `lot.text1`.

## qxp constraints (inherited)

- **No ported code.** The three reference files are read for flow only; every Swift file we add is fresh, SwiftUI-first, iOS 26 Liquid Glass.
- **Zero dependencies.** QR image via `CIFilter.qrCodeGenerator` (already in use in `BackupTransferView`). Scanning via the existing `DataScannerViewController` bridge in `ScanQrView`. Share sheet via SwiftUI `ShareLink`.
- **State shape.** No new view model if we can avoid it — `QrShowView` can compute the QR string directly off `AppState.context` at render time (cheap), and scan dispatch stays self-contained inside `ScanQrView`.

---

## Milestone 0 — Core bindings

Extend `qxp/Core/DcContext.swift` and `DcLot.swift` with the thin FFI wrappers the Show + Scan paths need. No UI in this milestone.

**Steps:**
- `DcContext.getSecurejoinQr(chatId: UInt32 = 0) -> String` → `dc_get_securejoin_qr`. Returns "" on error (per core docs; caller treats empty as "unavailable").
- `DcContext.joinSecurejoin(qr: String) -> UInt32` → `dc_join_securejoin`. Returns chat id (0 on failure). Nonisolated; callable from `Task.detached` since securejoin kicks off a background handshake.
- `DcContext.createChatByContactId(_ contactId: UInt32) -> UInt32` → `dc_create_chat_by_contact_id`. Used by the `DC_QR_ADDR` path.
- `DcLot.id: UInt32` — add via `dc_lot_get_id`. Needed for `ASK_VERIFYCONTACT` / `FPR_OK` / `FPR_MISMATCH` / `ADDR` routing.
- `DcConstants.swift` — extend `DcQrState` with every case M3 dispatches on: `askVerifyContact = 200`, `askVerifyGroup = 202`, `askVerifyBroadcast = 204`, `fprOk = 210`, `fprMismatch = 220`, `fprWithoutAddr = 230`, `proxy = 271`, `addr = 320`, `text = 330`, `url = 332`, `withdrawVerifyContact = 500`, `withdrawVerifyGroup = 502`, `withdrawJoinBroadcast = 504`, `reviveVerifyContact = 510`, `reviveVerifyGroup = 512`, `reviveJoinBroadcast = 514`. Existing cases (`account`, `backup2`, `backupTooNew`, `error`, `login`) stay.

**Exit:** repo compiles. No behaviour change.

---

## Milestone 1 — `QrTabView` shell

Add the third tab and a segmented Show/Scan container. Stub children so navigation works.

**Steps:**
- `qxp/Views/MainTabView.swift` — insert a `Tab("QR", systemImage: "qrcode") { QrTabView() }` between Chats and Settings (matching reference ordering: Chats, QR, Settings).
- New file `qxp/Views/QrTabView.swift`:
  - `NavigationStack` + `@State private var selection: Segment = .show` (local enum `.show, .scan`).
  - `Picker` styled `.segmented` in the toolbar's `ToolbarItem(.principal)`.
  - Content `switch selection` → `QrShowView()` or `ScanQrView(mode: .dispatch)` (M3 introduces the mode).
- Both children are stubs at this point — `QrShowView` is `Text("TODO")`, the scanner already exists but its new `.dispatch` mode lands in M3.

**Exit:** logged-in app shows three tabs; QR tab toggles cleanly between two placeholders.

---

## Milestone 2 — `QrShowView` (show own QR, share, copy, paste, withdraw)

The "Show" half of the tab. Renders the logged-in user's setup-contact QR and exposes the four actions.

**Steps:**
- New file `qxp/Views/QrShowView.swift`:
  - `@Environment(AppState.self)` → `ctx = appState.context`.
  - `private var qrCode: String { ctx?.getSecurejoinQr() ?? "" }` — recomputed on body evaluation (cheap, purely pulls from core state). No view model.
  - Body: `ScrollView` / `VStack(spacing: 24)`:
    1. White rounded card rendering the QR via `CIFilter.qrCodeGenerator` — extract the `makeQrImage` helper from `BackupTransferView.swift` into a new `qxp/Views/QrCodeImage.swift` utility view that both screens consume. (Two callers = justified abstraction.)
    2. Caption `Text(localized: "qrshow_join_contact_hint")` formatted with `ctx.displayName ?? ctx.getConfig(key: .addr) ?? ""`.
    3. `ShareLink(item: URL(string: qrCode) ?? …, subject: Text("share_invite_link"))` styled as a SwiftUI link button — avoids bridging `UIActivityViewController` ourselves, since the invite is already an `https://i.delta.chat/#…` URL.
  - Toolbar `ellipsis.circle` menu (`.topBarTrailing`):
    - **Share** → same `ShareLink` wired as a `Menu` item.
    - **Copy** → `UIPasteboard.general.string = qrCode` + transient toast / `Label` state ("Copied"), auto-cleared after 2 s.
    - **Paste** → read `UIPasteboard.general.string`, hand to the same dispatch helper M3 builds (refactor it into a plain `nonisolated` function so both Show and Scan route through it).
    - **Withdraw** → `.confirmationDialog("withdraw_verifycontact_explain")` with destructive OK → `ctx.setConfigFromQr(qrCode)` (re-applying the old QR rotates the server-side invite); refresh view by toggling a local `@State var refreshToken` that keys the QR image.
- Empty-string guard: if `qrCode.isEmpty` show an inline `ProgressView` + one-line explanation; Share / Copy items disabled.

**Exit:** tab 2 shows a scannable QR; `ShareLink` opens the system share sheet with the `https://i.delta.chat/#…` URL pre-populated; copy / paste / withdraw all work. The pasted string roundtrips through the scan dispatch (M3 wires the remote end).

---

## Milestone 3 — Scan dispatch (`ScanQrView.Mode.dispatch`)

Extend the shared scanner so it handles every `DC_QR_*` state, not just the two onboarding sub-cases.

**Steps:**
- `qxp/Views/ScanQrView.swift`:
  - Add `case dispatch` to `Mode`. No new callback — dispatch is self-contained (navigates to chats via `AppState`).
  - Factor the detection handler into a per-mode router. Keep `.setProvider` / `.receiveBackup` behaviour byte-for-byte.
  - New `.dispatch` router (called from both the live-camera path and the Paste Code path and from `QrShowView`'s Paste menu item):
    - `.askVerifyContact` / `.askVerifyGroup` / `.askVerifyBroadcast` → `.alert` ("Start verified chat with X?" — X = `text1` for group/broadcast, `DcContact(id: lot.id).displayName` for contact) → OK runs `ctx.joinSecurejoin(qr)` on `Task.detached` → on non-zero result, dismiss scanner and route to that chat via a new `AppState.openChat(id:)` helper (sets a published `pendingChatId` that `ChatListView` observes and pushes; switch selected tab to Chats).
    - `.fprOk` → info alert "contact_verified".
    - `.fprMismatch` → info alert "fingerprint mismatch" + `text1`.
    - `.fprWithoutAddr` → info alert with `text1`.
    - `.addr` → confirm "Start chat with X?" → `ctx.createChatByContactId(lot.id)` → route to chat as above.
    - `.text` → alert showing `text1` with Copy / OK.
    - `.url` → confirm "Open URL?" showing `text1` → `openURL`.
    - `.account` / `.login` / `.backup2` / `.backupTooNew` → info alert "Not applicable: already logged in. Log out first to use this onboarding code."
    - `.proxy` → info alert "Proxies are not yet supported in qxp" (text1 = address).
    - `.withdrawVerifyContact` / `.reviveVerifyContact` → confirm, then `ctx.setConfigFromQr(qr)`; if we're currently on `QrShowView` its `refreshToken` flip handles re-render.
    - `.withdrawVerifyGroup` / `.reviveVerifyGroup` / `.withdrawJoinBroadcast` / `.reviveJoinBroadcast` → same shape, but we have no group UI so the state change is applied silently with a confirmation toast.
    - `.error` → alert `text1`.
    - `nil` (unknown state) → alert "Unsupported QR code".
- `AppState`:
  - Add `@Published var pendingChatId: UInt32?` (via `@Observable` property; set from `openChat(id:)`; consumed and cleared by `ChatListView` on appear).
  - Add `@Published var selectedTab: Int` if we want to switch tabs programmatically; otherwise use the existing `Tab` selection binding pattern. Decide during M3: if `Tab` selection survives programmatic set in iOS 26, use that; if not, an `@Observable` int and `TabView(selection:)` is fine.
- `MainTabView` consumes `selectedTab`.

**Exit:** scanning each QR kind lands on the right end state. Peer-to-peer contact verification reaches a mutually-verified chat; `DC_QR_ADDR` opens a fresh chat; `DC_QR_TEXT` / `_URL` present the payload correctly; all `nil` / error paths show a non-fatal alert and the scanner stays live.

---

## Milestone 4 — Localization + strings

All five screens rely on `Localizable.xcstrings` keys that don't exist yet. We've been pushing this debt off since onboarding M2 — consolidate it here.

**Steps:**
- Walk M1–M3 and inventory every `String(localized:)` / `Text("…")` key.
- Copy the English values from `resources/deltachat-ios/deltachat-ios/en.lproj/Localizable.strings` into `qxp/Localizable.xcstrings`. Source of truth: the reference file; semantics stay identical.
- Specific new keys this plan introduces on top of the onboarding inventory: `qrshow_title`, `qrscan_title`, `qrshow_join_contact_hint`, `share_invite_link`, `menu_share`, `menu_copy_to_clipboard`, `paste_from_clipboard`, `withdraw_qr_code`, `withdraw_verifycontact_explain`, `contact_verified`, `ok`.

**Exit:** every QR-tab screen renders with proper strings in English; keys resolve rather than showing the literal key name.

---

## Milestone 5 — Device verification

Real-hardware walk-through (not executed in CI — user runs on their Mac + phones).

1. Log in on Device A. Open QR tab → Show → QR visible; caption reads "Chat with Alice (alice@…)".
2. Tap Share → system share sheet opens with the `https://i.delta.chat/#…` URL; AirDrop to Device B (which does not have qxp installed) → Safari opens the i.delta.chat landing → deep-link CTA visible.
3. Install qxp on Device B, log in as a different user, scan Device A's QR → "Start verified chat with Alice?" → OK → chat list now shows Alice with the verified badge; messages A↔B decrypt.
4. Copy: from Device A's QR tab, copy the invite link, paste into Messages → the pasted link is the same URL; pasting it into Device A's own QR tab → Paste → "Not applicable / you are the sender" path triggers gracefully (core should report this — if not, the info alert suffices).
5. Withdraw: on Device A tap Withdraw → confirm → the displayed QR re-renders with a *new* invite; Device C scanning the old (cached) code sees an error state.
6. Scan a plain `mailto:bob@example.com`-style `DC_QR_ADDR` QR → "Start chat with bob@example.com?" → chat opens.
7. Scan a `DC_QR_TEXT` QR (e.g., any random text QR) → alert shows the text with Copy.
8. Scan a `DC_QR_URL` QR pointing at `https://example.com` → confirm → Safari opens.
9. Scan a `DC_QR_ACCOUNT` onboarding QR while logged in → "Not applicable" alert.

**Exit:** every bullet lands on its described end state on real devices. Retrospective written into `plans/qr-tab.md` on archive.

---

## Dependency order

M0 → M1 → (M2, M3 in parallel) → M4 → M5.

M2 and M3 share the QR dispatch helper but not the view files — safe to interleave. M4 is a localization pass that cleans up everything the earlier milestones left as literal keys.

## Open questions

- **Toast vs. inline feedback for "Copied".** SwiftUI has no native toast on iOS 26; cheapest is a self-clearing label under the menu trigger. Decide during M2.
- **Programmatic tab switching.** If `TabView(selection:)` in iOS 26 misbehaves with `Tab` builder items, fall back to `@State` enum-backed tab keys. Decide during M3.
- **Withdraw/Revive for groups without group UI.** We apply the core-side state change but have nothing to show; acceptable per the "out of scope" line above.
