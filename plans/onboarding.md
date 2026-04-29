# PLAN: Onboarding — Create Profile · Add Second Device · Import Backup

## Context

The MVP currently drops first-run users straight into an email+password form (`LoginView`). That's not how the official Delta Chat iOS client works. The reference client presents a **Welcome splash** with two buttons (Sign Up / Alternative Logins) and, behind Sign Up, an **Instant Onboarding** screen that configures a chatmail account on a default relay with one tap — avatar, display name, privacy agreement, done. Manual IMAP/SMTP is demoted to a third-tier "other options" action.

We replicate the same UX in SwiftUI, feature-parity not UI-parity: three onboarding entry points fan out from the splash, the manual IMAP/SMTP form (today's `LoginView`) survives behind "Use Other Server → Manual Setup", and the multi-device backup-transfer flow (previous plan) becomes one of the "alternative logins" branches.

## Reference behaviour (observed, not copied)

Read from `references/deltachat-ios/deltachat-ios/Controller/ProfileSetup/{WelcomeViewController,InstantOnboardingViewController,InstantOnboardingView}.swift`:

**Welcome splash** (`WelcomeContentView`)
- Logo (top half, sized to 50 % of screen width on phone) + "Chat over Email" tagline below.
- Primary filled button: **"Sign Up"** (`onboarding_create_instant_account`).
- Secondary text-style button: **"I Already Have a Profile"** (`onboarding_alternative_logins`) → `.safeActionSheet` with:
  - **Add as Second Device** (`multidevice_receiver_title`) → QR scanner for `DC_QR_BACKUP2`.
  - **Restore Backup** (`import_backup_title`) → document picker for a `.tar` archive.
  - Cancel.

**Instant Onboarding** (`InstantOnboardingView`, vertical `UIStackView`)
1. 100×100 avatar button (placeholder = camera icon, tinted grey). Tapping opens a sheet: Camera / Gallery / Delete (if set) / Cancel.
2. Centred name `UITextField` (placeholder `pref_your_name`).
3. Hint label (`set_name_and_avatar_explain`).
4. System-blue "privacy" link button. Copy: `instant_onboarding_agree_default2` with the default relay hostname (`nine.testrun.org`) substituted, or `instant_onboarding_agree_instance` when a custom provider was supplied via QR. Tapping opens `https://<provider>/privacy.html` in Safari.
5. Filled blue **"Create Profile"** button (`instant_onboarding_create`) — disabled while the name field is empty; background greys out in sync.
6. Text-style **"Use Other Server"** button (`instant_onboarding_show_more_instances`) → `.safeActionSheet` with:
   - **Other Servers…** (`instant_onboarding_other_server`, external-link mark) → opens `https://chatmail.at/relays`.
   - **Scan Invitation Code** (`scan_invitation_code`) → QR scanner accepting `DC_QR_LOGIN` or `DC_QR_ACCOUNT`; on success the privacy button re-labels to the new host, the underlying QR string is remembered for configuring.
   - **Manual Setup** (`manual_account_setup_option`) → the IMAP/SMTP form (today's `LoginView`).
   - Cancel.

**On Create Profile**
- Dispatch to background queue.
- `dc_set_config_from_qr(ctx, qrCode ?? "dcaccount:\(defaultChatmailDomain)")` — defaults to `dcaccount:nine.testrun.org`. (The reference uses `addTransportFromQr` via JSON-RPC; the plain C FFI exposes `dc_set_config_from_qr`, which is the same code path for single-transport accounts.)
- `dc_configure(ctx)`.
- Progress alert listens to `DC_EVENT_CONFIGURE_PROGRESS` (2041). On 1000 → chat list; on 0 → show `lastErrorString`, leave screen intact so the user can edit name/server and retry.

## qxp constraints

- **No code is copied from the reference client.** The three `ProfileSetup/*.swift` files under `references/deltachat-ios/` are for understanding the flow only. Every Swift file we produce is written fresh against iOS 26 / SwiftUI conventions — no ported UIKit class hierarchies, no translated auto-layout constraints, no shared helper types.
- **iOS 26 floor. Liquid Glass everywhere.** Use the native iOS 26 Liquid Glass materials and the current (2025/2026) HIG. Backgrounds, sheets, buttons, navigation bars adopt the system's glass appearance by default — no custom translucency, no hand-rolled blurs, no legacy bar tinting. When a SwiftUI modifier gained a Liquid Glass variant in iOS 26, prefer that variant.
- **Zero dependencies.** No SPM adds, no CocoaPods, no vendored utilities. Needed capabilities:
  - QR rendering → `CIFilter.qrCodeGenerator` (built in).
  - QR scanning → `DataScannerViewController` via a 30-line `UIViewControllerRepresentable`.
  - Photo picking → `PhotosPicker` (pure SwiftUI).
  - Camera capture for avatars — decide during M3: either (a) skip camera on v1 and ship gallery-only via `PhotosPicker`, or (b) wrap an `AVCaptureSession` ourselves. Do **not** reach for `UIImagePickerController` just because the reference uses it.
  - File picking → SwiftUI `.fileImporter`.
- **SwiftUI only.** UIKit bridges appear only where SwiftUI genuinely lacks the primitive; each bridge should be < 50 LOC and live in its own file under `qxp/Views/`.
- **State shape stays:** `@Observable @MainActor` view models, event fan-out via `AppState.events`, Combine only where it already appears.
- **Localization:** reuse string keys from `references/deltachat-ios/deltachat-ios/en.lproj/Localizable.strings` (same semantics, same locale coverage). Copy the keys and English values into our `.strings` / `String(localized:)` call sites; don't import the file.

---

## Milestone 0 — Core bindings — ✅ DONE (2026-04-14)

All C functions and constants the three flows need, added to `qxp/Core/`. No UI yet.

**Outcome:** Extended `qxp/Core/DcContext.swift` with `setConfigFromQr`, `checkQr`, `imex`, `receiveBackup`, `stopOngoingProcess`, `lastErrorString`, `displayName` get/set, `selfAvatarPath`, `setSelfAvatar(jpegData:)`. New file `qxp/Core/DcLot.swift` — drain-on-construction struct matching the existing `ChatSummary` pattern. New file `qxp/Core/DcBackupProvider.swift` — owning class around `dc_backup_provider_*`. `DcConstants.swift` gained `DcQrState`, `DcImexKind`, `DcEvent.imexProgress = 2051`, and the `DcConfigKey.defaultChatmailDomain` string constant. `DcEventHandler` needed no code change — the generic handler already extracts `data1Int` for every event, so adding `.imexProgress` to the enum was sufficient.

**Gotcha — Swift 6 default isolation = MainActor.** This project has the "default isolation = MainActor" setting enabled. Under it, every unmarked class / struct / enum / method defaults to `@MainActor`. The new Core wrappers had to be marked `nonisolated` so they could be called from `Task.detached` (required by M1's onboarding paths). Applied `nonisolated` to: `DcContext`, `DcLot`, `DcBackupProvider`, and — while we were there — `DcChat`, `DcChatlist`, `DcContact`, `DcMsg`, plus every enum in `DcConstants.swift`. `DcAccounts` and `DcEventHandler` were already correct (the latter had it from the start; the former has an explicit `nonisolated init?`). The core is thread-safe per its docs, so `nonisolated` is semantically honest — see the `dc-expert` skill.

### `DcContext.swift` extensions
- `func setConfigFromQr(_ qr: String) -> Bool` → `dc_set_config_from_qr`.
- `func checkQr(_ qr: String) -> DcLot` → `dc_check_qr`.
- `func imex(what: Int32, param1: String?, param2: String?)` → `dc_imex`.
- `func receiveBackup(qr: String) -> Bool` → `dc_receive_backup`.
- `func stopOngoingProcess()` → `dc_stop_ongoing_process`.
- `var lastErrorString: String` → `dc_get_last_error`.
- `var displayName: String?` / `var selfAvatarPath: String?` backed by `dc_get_config` / `dc_set_config` on the existing `displayName`, `selfAvatar` keys.
- `func setSelfAvatar(jpegData: Data) throws` — writes into the account's blobs directory (`dc_get_blobdir`) and points `selfavatar` at the new file.

### New file: `qxp/Core/DcLot.swift`
Minimal wrapper over `dc_lot_t` (`state: Int32`, `text1: String?`, `text2: String?`). Used to branch on the QR state.

### New file: `qxp/Core/DcBackupProvider.swift`
Source-side wrapper (for M5): `init?(context:)`, `var qr: String?`, `func wait()`, `deinit`. No SVG (`dc_backup_provider_get_qr_svg` is deprecated; we render the plain QR string ourselves).

### `DcConstants.swift` additions
- `DcEvent.imexProgress = 2051`.
- `DcQrState`: `.login = 520`, `.account = 250`, `.backup2 = 252`, `.backupTooNew = 255`, `.error = 400`.
- `DcImexKind`: `.importBackup = 12`.
- `DcConfigKey.defaultChatmailDomain = "nine.testrun.org"` (string constant, not a config key — kept here so the onboarding view and tests share one source of truth).

### `DcEventHandler.swift`
Map `DC_EVENT_IMEX_PROGRESS` into `DcEventData` with `data1Int` = permille (0 = failure, 1000 = success).

**Exit:** clean build; manual REPL test via `DcAccounts` → `setConfigFromQr("dcaccount:nine.testrun.org")` + `configure()` on a scratch account reaches `isConfigured = true`.

---

## Milestone 1 — `AppState` surface — ✅ DONE (2026-04-14)

Collapse all three onboarding outcomes (instant-create, restore-backup, receive-backup) onto one progress channel, so each view shows the same sheet.

**Outcome:** `OnboardingPhase` enum added at file scope in `qxp/State/AppState.swift` (so views and view models can consume it). `AppState` gained observable `onboardingPhase`, `onboardingProgress`, private `importingURL` holder, and the four public methods from the plan — `createInstantAccount(qrCode:)`, `importBackup(fileURL:)`, `receiveBackup(qrCode:)`, `cancelOnboarding()` — plus a small `resetOnboarding()` helper used by M3's progress sheet to dismiss the `.failed` state back to `.idle`. `handleConfigureProgress` now drives both the legacy `isConfiguring` path (LoginView keeps working unchanged) and the new `onboardingPhase == .configuring` path from a single event. A new `handleImexProgress` covers `.importing` and `.receiving`, with `recreateScratchAccount` running on `progress = 0` so cancellation and natural failures share one recovery path (no leaked scratch accounts). `cancelOnboarding()` only calls `stopOngoingProcess()`; the event-driven cleanup does the rest.

**Gotcha — concurrency adjustments.** `DcContext` had to be marked `nonisolated final class … @unchecked Sendable` so it could be captured into `Task.detached { … }` from `AppState`. The plan's "on background queue" phrasing in M1 required this; noted in M0 outcome as part of the wider nonisolated sweep.

- `OnboardingPhase`: `.idle`, `.configuring`, `.importing`, `.receiving`, `.failed(String)`.
- `onboardingPhase: OnboardingPhase`.
- `onboardingProgress: Int` (0–1000).
- `func createInstantAccount(qrCode: String?)` — `qrCode ?? "dcaccount:\(DcConfigKey.defaultChatmailDomain)"`; on background queue → `setConfigFromQr` then `configure`. Existing `handleConfigureProgress` feeds `onboardingProgress` alongside `isLoggedIn`.
- `func importBackup(fileURL: URL)` — start security-scoped access, `stopIo`, dispatch `context.imex(.importBackup, filepath, nil)`; listen for `imexProgress`; on success `startIo` + `isLoggedIn = true`; on failure remove the scratch account, re-add, stay on Welcome.
- `func receiveBackup(qrCode: String)` — carry-over from prior plan (bookkeeping: `stopIo`, possibly `accounts.add()` if selected is configured, then `receiveBackup` on background queue). Reuses the same progress channel.
- `func cancelOnboarding()` — `context.stopOngoingProcess()`; also removes the half-created scratch account when the failed phase was `.importing` or `.receiving`.

Rationale for one channel: the three flows are mutually exclusive (they all end in "first account is configured"), and a single `.onboardingPhase` keeps the view models flat.

**Exit:** unit harness or scripted REPL test drives all three transitions to completion and back to `.idle` without leaking scratch accounts.

---

## Milestone 2 — `WelcomeView` (splash) — ✅ DONE (2026-04-14)

**Outcome:** `qxp/Views/WelcomeView.swift` created — Logo at 45% viewport height, `welcome_chat_over_email` tagline, `.borderedProminent`+`.controlSize(.large)` Sign Up button (full-width), borderless "I Already Have a Profile" opens a `.confirmationDialog` with Add-as-Second-Device / Restore-Backup / Cancel. Restore-Backup branch uses SwiftUI's native `.fileImporter` filtered to `.tar` and calls `appState.importBackup(fileURL:)` directly (already live from M1). `qxpApp.swift` switched from `LoginView()` to `NavigationStack { WelcomeView() }` for the unauthenticated route. Needed an `import UniformTypeIdentifiers` for `UTType(filenameExtension: "tar")`.

**Placeholders left for later milestones** (grep `TODO(M3)` / `TODO(M4)`):
- Sign Up `NavigationLink` destination points at a stub `Text` — M3 replaces with `InstantOnboardingView()`.
- `.fullScreenCover` for Add-as-Second-Device shows a stub — M4 replaces with `ScanQrView(mode: .receiveBackup)`.

**Localization gap:** string keys (`welcome_chat_over_email`, `onboarding_create_instant_account`, `onboarding_alternative_logins`, `multidevice_receiver_title`, `import_backup_title`, `cancel`) are referenced but not yet in `Localizable.xcstrings` — SwiftUI renders the key literal until entries are added. Deferred.



`qxp/Views/WelcomeView.swift` — SwiftUI. Layout mirrors the reference:

```
┌──────────────────────┐
│                      │
│       [Logo]         │  ~45 % of viewport height, centred
│                      │
│   Chat over Email    │  title1, grey
│                      │
│  [ Sign Up         ] │  borderedProminent, full-width-ish
│  I Already Have…     │  borderless, systemBlue
└──────────────────────┘
```

- Uses the existing `Image("Logo")` asset.
- Tagline localized as `welcome_chat_over_email`.
- **Sign Up** → `NavigationLink` to `InstantOnboardingView`.
- **I Already Have a Profile** → `.confirmationDialog` with the two alternatives; the handlers flip two booleans to present `ScanQrView(mode: .receiveBackup)` (`.fullScreenCover`) and the backup `.fileImporter`.
- `qxpApp.swift`: change the `isReady && !isLoggedIn` branch from `LoginView` to `WelcomeView`. Wrap the whole unauthenticated tree in a `NavigationStack`.

**Exit:** first cold launch shows WelcomeView; both secondary actions reach their destinations.

---

## Milestone 3 — `InstantOnboardingView` (create profile) — ✅ DONE (2026-04-14)

**Outcome:** created `qxp/State/InstantOnboardingViewModel.swift` (`@Observable @MainActor`, owns `displayName` / `avatarImage` / `qrCode`, `providerHost` derived via `DcContext.checkQr` with an email-domain split for `.login`-kind QRs, `applyScanned` gated on `.login`/`.account`). Created `qxp/Views/InstantOnboardingView.swift` with the full ScrollView layout per plan: 100×100 avatar Button (confirmationDialog with Gallery/Delete/Cancel, Gallery presents a `PhotosPicker` via a dedicated `showPhotosPicker` state), centered `TextField` bound to the vm, secondary explain text, tappable privacy link (renders `https://<providerHost>/privacy.html`), `.borderedProminent` Create button, and "Use Other Server" confirmationDialog (Other Servers → openURL, Scan Invitation Code → M4 placeholder `fullScreenCover`, Manual Setup → `NavigationLink` to `ManualLoginView`). Progress `.sheet` bound to `.configuring`/`.importing`/`.receiving` with `.interactiveDismissDisabled()` and a linear `ProgressView` + cancel. Failure `.alert` bound to `.failed(msg)`, OK calls `appState.resetOnboarding()`. Wired `WelcomeView`'s Sign Up `NavigationLink` to `InstantOnboardingView()`.

**Gotcha:** the plan described the avatar gallery flow without specifying the SwiftUI mechanics, and SwiftUI's `confirmationDialog` button can't also be the `.photosPicker` trigger — the sheet is torn down before the picker can present. Using a dedicated `showPhotosPicker` state (set `true` from the Gallery button, read by `.photosPicker(isPresented:)`) works cleanly. Image load is done via `.task(id: photoItem)` calling `loadTransferable(type: Data.self)` → `UIImage(data:)` → `vm.applyAvatar(_:)` which writes the JPEG into the blobdir and points `selfavatar` at it. Strings still reference localized keys; `Localizable.xcstrings` will be populated from `references/deltachat-ios/` in a later pass.

`qxp/Views/InstantOnboardingView.swift` + `qxp/State/InstantOnboardingViewModel.swift`.

### View model
- `@Observable @MainActor`.
- `displayName: String` (bound to the text field).
- `avatarImage: UIImage?` (kicks off `setSelfAvatar` when set).
- `qrCode: String?` (nil ⇒ default relay).
- `providerHost: String` — derived from `qrCode` via `checkQr`'s `text1`, or `defaultChatmailDomain` when nil.
- `isCreateEnabled: Bool` — `!displayName.trimmed.isEmpty && appState.onboardingPhase == .idle`.
- `func create()` → writes `displayName` via `context.displayName =`, calls `appState.createInstantAccount(qrCode:)`.
- `func applyScanned(_ qr: String) throws` — `checkQr`, require `.login` or `.account`, else throw a user-visible error.

### View layout (SwiftUI `VStack` in a `ScrollView`)
1. Circular `Button` (100×100) with `avatarImage ?? Image(systemName: "camera.fill")` — opens `.confirmationDialog`: Gallery / Delete / Cancel on v1 (gallery via `PhotosPicker`). Add a "Camera" action in a follow-up only if it's needed — see the qxp constraints note above on avoiding `UIImagePickerController`.
2. `TextField("pref_your_name", text: $vm.displayName)` — `.textFieldStyle(.roundedBorder)`, `.multilineTextAlignment(.center)`, focused on appear.
3. `Text(localized: "set_name_and_avatar_explain")` — `.font(.subheadline)`, `.foregroundStyle(.secondary)`.
4. `Button` styled as a link, title = formatted privacy agreement with `vm.providerHost`. `.onTapGesture` opens `https://<providerHost>/privacy.html` via `@Environment(\.openURL)`.
5. `Button("instant_onboarding_create", action: vm.create).buttonStyle(.borderedProminent).disabled(!vm.isCreateEnabled)`.
6. `Button("instant_onboarding_show_more_instances")` → `.confirmationDialog`:
   - **Other Servers…** → `openURL(https://chatmail.at/relays)`.
   - **Scan Invitation Code** → presents `ScanQrView(mode: .setProvider)`; on result calls `vm.applyScanned`.
   - **Manual Setup** → `NavigationLink` to the existing `LoginView` (renamed to `ManualLoginView` for clarity; the email+password form stays byte-for-byte).
   - Cancel.

### Progress sheet
- A `.sheet(isPresented: …)` bound to `appState.onboardingPhase != .idle && phase != .failed` shows a non-dismissable `ProgressView` + percentage + cancel button.
- On `isLoggedIn == true` (root route flips to `ChatListView`) the sheet tears down naturally.
- On `phase == .failed(msg)` the sheet shows an error alert with OK; dismissing resets phase to `.idle`.

**Exit:** entering a name and tapping Create with no network shows an error; with network reaches the chat list on a fresh device in ≤10 s.

---

## Milestone 4 — `ScanQrView` (shared QR scanner) — ✅ DONE (2026-04-14)

**Outcome:** created `qxp/Views/ScanQrView.swift` as a SwiftUI `View` that wraps `DataScannerViewController` via a private `DataScannerRepresentable` (`UIViewControllerRepresentable` + NSObject `Coordinator` conforming to `DataScannerViewControllerDelegate`). Modes: `.setProvider` (routes accepted `.login`/`.account` QRs to an `onSetProvider` closure, rejects others with an inline alert — `lot.text1` used as the error message when the core provides one) and `.receiveBackup` (accepts `.backup2`, shows a confirm alert and on OK calls `appState.receiveBackup(qrCode:)`; `.backupTooNew` shows an update-required alert; anything else is rejected). Cancel button top-leading, Paste Code button bottom — the Paste path reuses `handle(_:)` so it goes through the same validation. When `DataScannerViewController.isSupported` or `.isAvailable` is false (simulator / denied permission) the camera view is replaced by a simple "Camera unavailable. Use Paste Code below." message — Paste still works. Wired into both placeholders: `WelcomeView` "Add as Second Device" → `ScanQrView(mode: .receiveBackup)`; `InstantOnboardingView` "Scan Invitation Code" → `ScanQrView(mode: .setProvider) { code in try? vm.applyScanned(code) }` with the throw surfacing as `scanErrorMessage`.

**Gotcha:** the project uses `GENERATE_INFOPLIST_FILE = YES`, so `NSCameraUsageDescription` cannot be added via an Info.plist file — it needs to be set as a build setting. Add `INFOPLIST_KEY_NSCameraUsageDescription = "qxp scans QR codes for onboarding and backup transfer."` in Xcode's target Build Settings (or Info tab). Without it the scanner will be denied permission at runtime and fall back to the "Camera unavailable" message. `DataScannerViewControllerDelegate.didAdd` dedups by item identity, so a stationary QR fires once (no re-fire while an alert is visible), but if the user moves away and back the delegate fires again — acceptable.

`qxp/Views/ScanQrView.swift` — `UIViewControllerRepresentable` around `DataScannerViewController`.

- `enum Mode { case setProvider; case receiveBackup }`.
- On each detected string:
  - `.setProvider`: `context.checkQr`; accept `.login` / `.account`; else alert-and-resume.
  - `.receiveBackup`: `.backup2` → confirmation alert ("Ready to receive from the other device?" with OK/Cancel); `.backupTooNew` → "Update qxp on this device" alert; else → "Not a Delta Chat backup code".
- On confirmation (receiveBackup): trigger local-network privacy prompt (see M7), then `appState.receiveBackup(qrCode:)`.
- Additionally: a "Paste Code" row for simulator / accessibility, using `UIPasteboard.general.string`.

**Exit:** both modes round-trip valid and invalid inputs with the correct alerts. Simulator works via Paste.

---

## Milestone 5 — Backup transfer, source side ("Add Second Device" in Settings) — ✅ DONE (2026-04-14)

**Outcome:** created `qxp/State/BackupTransferViewModel.swift` (`@Observable @MainActor`) which owns the `DcBackupProvider` lifecycle. `start(appState:)` stops IO, subscribes to `appState.events` for `imexProgress`, and spawns a `Task.detached` that constructs the provider (off the main actor — `dc_backup_provider_new` prepares the backup), hops to MainActor to publish the `DCBACKUP2:…` QR and transition `.preparing → .transferring`, then blocks in `provider.wait()`; on return `finalize()` resolves terminal state (`.finished` if progress hit 1000, `.cancelled` otherwise) and calls `accounts.startIo()`. `cancel()` pre-sets `.cancelled` then calls `stopOngoingProcess` — the imex=0 event that follows won't overwrite the cancelled marker with a spurious `.failed`. `teardown()` is the symmetric on-disappear cleanup. Created `qxp/Views/BackupTransferView.swift`: title + subtitle, a QR area rendered with `CIFilter.qrCodeGenerator` (`correctionLevel = "M"`, 10× affine scale, nearest-neighbour interpolation) on a white rounded card, a status area switching on `vm.status` (progress bar with percentage for `.transferring`, success/cancel/fail labels for terminal states), and a Cancel toolbar button with a `confirmationDialog` that calls `vm.cancel()` then dismisses. `UIApplication.shared.isIdleTimerDisabled` is toggled on appear/disappear. `onChange(of: vm.status)` auto-dismisses on `.finished`. Added the "Add Second Device" row to `SettingsView` guarded by `appState.context?.isConfigured == true`, pushing `BackupTransferView` via `NavigationLink`.

**Gotcha:** `cancel()` needs to pre-set status before calling `stopOngoingProcess` because the core responds with an `imex_progress=0` event, which the shared event handler would otherwise classify as a core failure (emitting `lastErrorString` as a user-facing message). The `status != .cancelled` guard in `handleEvent` cleanly preserves the user's intent. Also: `Task.detached` capturing `DcContext` only works because `DcContext` is already `nonisolated final class … @unchecked Sendable` (established in M0); the `provider` is constructed inside the detached task so its init runs off-main too.

Carry-over from the previous plan.

- `qxp/Views/SettingsView.swift` gains a single-row "Add Second Device" entry, visible only when the active account is configured.
- `qxp/Views/BackupTransferView.swift` owns `BackupTransferViewModel` (unchanged from prior plan): `stopIo`, construct `DcBackupProvider`, render `.qr` with `CIFilter.qrCodeGenerator`, stream `imexProgress` into a progress bar, Cancel confirms and calls `stopOngoingProcess`.
- Disable the idle timer for the lifetime of the view.

**Exit:** Settings → Add Second Device shows a scannable QR; M4's `.receiveBackup` on a second device pairs successfully.

---

## Milestone 6 — Backup import from file — ✅ DONE (2026-04-14)

**Outcome:** the `.fileImporter` and the `appState.importBackup(fileURL:)` handler were already wired from M2/M1, but neither entry-point view had the progress UI rendered when a flow was triggered from its own tree. Extracted the progress sheet + failure alert into a shared `ViewModifier` at `qxp/Views/OnboardingProgressOverlay.swift` exposed as `View.onboardingProgressOverlay()`. The sheet now also shows a phase-specific caption — `"Configuring…"`, `"Importing backup…"`, or `"Transferring…"` — derived from `appState.onboardingPhase`. Applied the modifier to `WelcomeView` (covers `.importing` from the file importer and `.receiving` from the M4 `ScanQrView(.receiveBackup)` dismissal) and replaced the InstantOnboardingView's inline progress/failure code with the same modifier. Behaviour of the `.failed(msg)` alert (OK → `appState.resetOnboarding()`) and the Cancel button (→ `appState.cancelOnboarding()`) is unchanged.

**Gotcha:** the plan's premise "reusing the M1 progress channel means the same UI renders here" was literally true for the state machine, but not for the view layer — the sheet has to be attached at each entry point. Using a shared `ViewModifier` keeps it one line per caller and pins the label vocabulary in one place. The `.receiving` path also works from WelcomeView because `ScanQrView(.receiveBackup)` dismisses its `fullScreenCover` on OK, returning control to WelcomeView before the first `imexProgress` event fires.

The Welcome splash's "Restore Backup" branch.

- SwiftUI `.fileImporter(allowedContentTypes: [.init(filenameExtension: "tar") ?? .item])`.
- Handler:
  1. `url.startAccessingSecurityScopedResource()` — store so we can stop it later.
  2. `appState.importBackup(fileURL: url)` — shows the shared progress sheet.
- Reusing M1 progress channel means the same UI renders here, with `.importing` distinguishing the label ("Importing backup…" vs "Configuring…" vs "Transferring…").

**Exit:** exporting a backup on Device A (via the official client), zipping to `.tar`, AirDropping, picking in Welcome → Restore Backup lands on a chat list containing Device A's history.

---

## Milestone 7 — iOS integration — ✅ DONE (2026-04-14)

**Outcome:** added three privacy-description build settings to the `qxp` target in `qxp.xcodeproj/project.pbxproj` (Debug + Release): `INFOPLIST_KEY_NSCameraUsageDescription` ("Scan a QR code to pair this device or join a chat."), `INFOPLIST_KEY_NSLocalNetworkUsageDescription` ("Transfer your account from another device on this network."), `INFOPLIST_KEY_NSPhotoLibraryUsageDescription` ("Pick a profile picture."). Because `GENERATE_INFOPLIST_FILE = YES`, these are emitted into the generated Info.plist at build time — no standalone plist file to maintain. Created `qxp/Core/LocalNetworkPrompt.swift` — a `nonisolated` enum with one static `trigger()` that opens an IPv4 UDP socket, sets `SO_BROADCAST`, enumerates broadcast-capable interfaces via `getifaddrs`, and `sendto`s a zero-length datagram to each interface's broadcast address on port 9 (falls back to `255.255.255.255:9` if no broadcast interface is enumerated). Called from two places: `ScanQrView`'s backup-confirmation alert OK button (before `appState.receiveBackup`) and `BackupTransferViewModel.start` (before spawning the detached provider task). Added idle-timer discipline to `ScanQrView` gated on `.receiveBackup` mode — `BackupTransferView` already had it from M5.

**Gotcha:** iOS surfaces the local-network prompt on the first actual local-network traffic, which otherwise would be iroh-net's handshake deep inside `dc_receive_backup` / `dc_backup_provider_wait` — with the user staring at a progress bar and no idea why the OS is interrupting. Firing a throwaway broadcast from a clearly-attributed UI moment (the "ready to receive" OK button, or pushing the transfer screen) moves the prompt onto the correct screen. `IFF_UP`/`IFF_BROADCAST` are `Int32` in `<net/if.h>` but `ifa_flags` is `UInt32`, so the flag test needs `flags & UInt32(IFF_UP) != 0`. The `sin_len` byte is required on Darwin's `sockaddr_in`.

(Unchanged from the prior plan; bundled here for completeness.)

- `Info.plist`:
  - `NSCameraUsageDescription` — "Scan a QR code to pair this device or join a chat."
  - `NSLocalNetworkUsageDescription` — "Transfer your account from another device on this network."
  - `NSPhotoLibraryUsageDescription` — "Pick a profile picture." (new, needed for the avatar gallery path.)
- `qxp/Core/LocalNetworkPrompt.swift` — send a throwaway UDP datagram to `255.255.255.255:9` on every broadcast-capable interface before `receiveBackup` / `provider.wait()`, to surface the prompt early.
- Idle-timer discipline on BackupTransferView and ScanQrView(.receiveBackup).
- `libs/libdeltachat.xcframework` already exports every needed symbol (audited 2026-04-13): `dc_set_config_from_qr`, `dc_check_qr`, `dc_imex`, `dc_receive_backup`, `dc_stop_ongoing_process`, `dc_backup_provider_*`, `dc_get_blobdir`. No rebuild.

**Exit:** first cold launch presents camera and local-network prompts at the correct moments; photo-library prompt only on gallery tap.

---

## Milestone 8 — Error paths — ✅ DONE (2026-04-14)

**Outcome:** audited the six failure modes from the plan. Four were already covered by earlier milestones and only verified here: `setConfigFromQr`-returns-false surfaces `context.lastErrorString` via `createInstantAccount`'s MainActor hop to `.failed(...)`; `DC_EVENT_CONFIGURE_PROGRESS = 0` already routes to `onboardingPhase = .failed(msg)` with the name/avatar/provider still living on the view model; `DC_EVENT_IMEX_PROGRESS = 0` calls `releaseImportingURL` / `recreateScratchAccount` and transitions to `.failed` before handing back to Welcome via the shared overlay; `DC_QR_BACKUP_TOO_NEW` is trapped in `ScanQrView` with its own alert without calling `receiveBackup`. The two missing cases — scene-background and nav-back-during-configure — are implemented here. `AppState` gained a `private var wasBackgroundCancelled: Bool` flag and a `consumeBackgroundCancelReason()` single-use helper. `handleScenePhase(.background)` now switches on `onboardingPhase` and, if a flow is live, sets the flag and calls `context.stopOngoingProcess()`; the existing `.configureProgress = 0` and `.imexProgress = 0` handlers consume the flag so the user sees "Cancelled — app was backgrounded" instead of a generic "Login/Import/Transfer failed". `InstantOnboardingView` gained an `.onDisappear` that calls `appState.cancelOnboarding()` when the phase is still `.configuring` on pop — covers the rare window where the progress sheet has been torn down by an error alert but the user then navigates back before resubmitting. `OnboardingProgressOverlay.progressSheet` now shows an `onboarding_keep_app_open` caption under the percentage so the foreground-required invariant is visible.

**Gotcha:** the imex=0 / configure=0 handlers already dispatch `.failed(...)` from the core's event — we can't eagerly set `.failed` on backgrounding because the subsequent event would fall into the `.failed` switch case and bypass `recreateScratchAccount` / `releaseImportingURL`, leaving a half-written DB. The flag-and-consume pattern keeps the natural cleanup ordering intact and only rewrites the user-facing message. `.onDisappear` on `InstantOnboardingView` does *not* fire when the progress sheet is shown (sheets layer over parents without triggering disappear) — so this hook only cancels when the view is genuinely popped from the navigation stack.

- `setConfigFromQr` returns false (invalid QR syntax) → surface `lastErrorString`, stay on InstantOnboardingView.
- `DC_EVENT_CONFIGURE_PROGRESS` emits 0 → error sheet, keep name/avatar/provider intact so user can retry.
- `DC_EVENT_IMEX_PROGRESS` emits 0 during import or receive → remove scratch account, add+select a clean one, surface error, return to Welcome.
- `DC_QR_BACKUP_TOO_NEW` → specific alert, don't call `receiveBackup`.
- Scene background during any `.onboardingPhase != .idle` → `stopOngoingProcess()`, mark `.failed("Cancelled — app was backgrounded")`. Document in UI that onboarding requires foreground.
- User navigates back during configure → treat as cancel (same as scene-background).

**Exit:** manually induced failures at each step leave the app in a retry-able state with no dangling scratch accounts.

---

## Milestone 9 — Device verification

Ordered so each step covers one branch of the flow.

1. Fresh install on Device A → WelcomeView appears.
2. Sign Up → default relay → enter name "Alice", pick avatar → Create → chat list with Device Messages.
3. Fresh install on Device B → Sign Up → "Use Other Server" → "Manual Setup" → enter an existing IMAP/SMTP account → chat list.
4. Export backup from Device B using official client, transfer to Device C, Restore Backup → chat list with history.
5. Device A (Settings → Add Second Device) + Device D (Welcome → I Already Have a Profile → Add as Second Device) on same Wi-Fi → scan → Device D lands on chat list with Alice's history.
6. Send a message A↔D → both decrypt (the original bug the multi-device branch fixes).
7. Scan an invitation QR on a fresh Device E during InstantOnboarding → privacy link updates to the scanned host → Create → lands on chat list using that provider.

**Exit:** each branch completes end-to-end on real hardware; retrospective in `plans/onboarding.md`.

---

## Dependency order

M0 → M1 → (M2, M3, M4 in parallel) → (M5, M6 in parallel) → M7 → M8 → M9.

M2 unblocks user-visible routing change; do it first among the UI milestones so subsequent manual testing starts from the correct entry point.

## Superseded

The previous multi-device-only plan is fully subsumed. Its resolved open questions (QR rendering via `CIFilter`, no Bonjour, xcframework already sufficient) remain resolved — migrated into M5 / M7 above.
