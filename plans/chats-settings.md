# PLAN: Chats Settings

## Context

Port the "Chats and Media" settings section from the Delta Chat iOS reference client (`references/deltachat-ios/`) into qxp. Every setting must be wired to deltachat-core so it actually takes effect — no dead toggles.

**In scope:** Blocked contacts list, outgoing media quality, auto-download limit, read receipts, auto-delete (device + server). All effective via `dc_set_config` / `dc_get_config`.

**Not in scope:** Export/backup (already exists as BackupTransferView), groups/media settings beyond the reference "Chats" section.

## Reference behaviour

The reference client's `ChatsAndMediaViewController` shows three sections:

1. **Preferences** — Blocked Contacts (nav link → list with unblock), Outgoing Media Quality (picker: balanced/worse via `media_quality`), Auto-Download Messages (picker: 5 size thresholds via `download_limit`), Read Receipts (toggle via `mdns_enabled`).
2. **Delete Old Messages** — Auto-Delete from Device (picker via `delete_device_after`), Auto-Delete from Server (picker via `delete_server_after`, hidden for chatmail accounts; options vary by chatmail vs standard).
3. **Backup** — already implemented in qxp, skip.

Blocked contacts uses `dc_get_blocked_contacts` → array of contact IDs; tapping a contact shows "Unblock?" confirmation, calls `dc_block_contact(id, 0)`.

Auto-delete pickers show a confirmation alert when enabling (non-zero), including an estimated deletion count from `dc_estimate_deletion_cnt`. Server auto-delete shows a footer hint when enabled.

---

## Phase 1: Core layer — int/bool config helpers + new config keys + blocked contacts API ✅

**Goal:** Expose all C functions and config keys needed by the Chats settings UI.

### Steps

1. Add `getConfigInt(_:) -> Int` and `setConfigInt(_:_:)` convenience methods to `DcContext` (string round-trip through existing `getConfig`/`setConfig`).
2. Add `getConfigBool(_:) -> Bool` and `setConfigBool(_:_:)` similarly.
3. Add `isChatmail: Bool` computed property (`getConfigInt("is_chatmail") == 1`).
4. Add `estimateDeletionCount(fromServer:seconds:) -> Int` wrapping `dc_estimate_deletion_cnt`.
5. Add `getBlockedContacts() -> [UInt32]` wrapping `dc_get_blocked_contacts`.
6. Add config key constants to `DcConfigKey`: `mediaQuality`, `downloadLimit`, `mdnsEnabled`, `deleteDeviceAfter`, `deleteServerAfter`.

---

## Phase 2: Chats settings UI ✅

**Goal:** Build `ChatsSettingsView` and its sub-views, wire everything to core.

### Steps

1. Create `ChatsSettingsView` with three sections:
   - **Section 1 — Preferences:** NavigationLink to `BlockedContactsView`, NavigationLink to media quality picker, NavigationLink to auto-download picker, Toggle for read receipts.
   - **Section 2 — Delete Old Messages:** NavigationLink to device auto-delete picker (with current value subtitle), NavigationLink to server auto-delete picker (hidden if chatmail; with current value subtitle).
2. Create `BlockedContactsView` — lists blocked contacts by name/email, tap shows unblock confirmation, empty state text when none blocked.
3. Create `MediaQualityPickerView` — two-option picker (Balanced / Worse), checkmark on current, writes `media_quality` on select.
4. Create `AutoDownloadPickerView` — five-option picker (No limit, 160 KiB, 640 KiB, 5 MiB, 25 MiB), writes `download_limit`.
5. Create `AutoDeletePickerView(fromServer: Bool)` — option picker with confirmation alert for non-zero values. Shows estimated deletion count in alert. Device options: Never/1h/1d/1w/5w/1y. Server options vary by chatmail. Footer hint when server auto-delete is enabled.
6. Add NavigationLink to `ChatsSettingsView` in `SettingsView`, after Appearance.

---

## Open questions / deferred

- Backup export is already handled by `BackupTransferView`; not duplicated here.
- Per-chat settings (ephemeral timer, mute) are separate from global "Chats" settings.
