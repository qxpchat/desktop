# PLAN: Compose Flow, Groups & Channels

## Context

The MVP shipped 1:1 chat only. This plan adds:
1. **Compose button** — replace the QR-scan toolbar icon with a Signal-style pen/compose icon that opens a new-conversation screen.
2. **New-conversation screen** — search contacts, "New Contact" (with QR), "New Group", "New Channel", then a contacts list. Tapping a contact opens/creates a 1:1 chat.
3. **Group creation** — name + member selection → create encrypted group chat.
4. **Channel (broadcast list) creation** — name + recipient selection → create outgoing broadcast.
5. **Group/channel editing** — rename, add/remove members from an existing group or channel.

**Not in scope:** mailing-list joining, media in groups, advanced group settings (disappearing messages, mute per-group). These can be layered later.

**Reference behaviour** (from `references/deltachat-ios/`):
- `NewChatViewController` shows a table: [Scan QR, New Group, New Broadcast] then a searchable contacts section. Tapping a contact creates a 1:1 chat via `dc_create_chat_by_contact_id`.
- `NewGroupController` collects a group name (required), then lets the user pick members via `AddGroupMembersViewController` (multi-select with checkmarks + search). On "Done": calls `dc_create_group_chat(verified, name)` → loops `dc_add_contact_to_chat` for each member. For broadcasts: `dc_create_broadcast_list(name)` instead, self not included.
- `EditGroupViewController` lets users rename and manage members of an existing group.

---

## Phase 1: Core Bindings & Compose Entry Point

**Goal:** Add missing C API wrappers and replace the toolbar QR button with a compose button that opens a new sheet.

### Steps

1. **Add Core wrappers** to `DcContext.swift`:
   - `createGroupChat(verified:name:) -> UInt32` — wraps `dc_create_group_chat(handle, verified ? 1 : 0, name)`.
   - `createBroadcastList() -> UInt32` — wraps `dc_create_broadcast_list(handle)`.
   - `setChatProfileImage(chatId:path:) -> Bool` — wraps `dc_set_chat_profile_image(handle, chatId, path)`. Pass `nil`/empty to remove.
   - `setChatDescription(chatId:description:) -> Bool` — wraps `dc_set_chat_description(handle, chatId, descr)`.
2. **Replace toolbar icon** in `ChatListView.swift`:
   - Change `qrcode.viewfinder` → `square.and.pencil` (SF Symbol matching Signal's compose icon).
   - Action: present a new `ComposeView` sheet instead of `ScanQrView`.

3. **Stub `ComposeView.swift`** — a `NavigationStack` sheet with placeholder sections (will be filled in Phase 2). Dismiss on chat open.

---

## Phase 2: Compose View — Contacts & 1:1 Chat Creation

**Goal:** Full compose screen: search, action rows, contacts list. Tapping a contact creates/opens a 1:1 chat.

### Steps

1. **Build `ComposeView.swift`** with this layout:
   - **Search bar** (`.searchable`) at top, filters contacts.
   - **Actions section:**
     - "New Contact" row with `qrcode.viewfinder` icon → opens `ScanQrView(mode: .dispatch)`.
     - "New Group" row with `plus.circle` icon → pushes `NewGroupView` (Phase 3).
     - "New Channel" row with `plus.circle` icon → pushes `NewChannelView` (Phase 4).
   - **Contacts section:** lists all contacts via `context.getContacts(flags: DC_GCL_ADD_SELF)`, filtered by search text. Each row shows avatar, name, email.
   - **Tap contact** → call `context.createChatByContactId(contactId)` → `appState.openChat(id:)` → dismiss sheet.

2. **Reuse `AvatarView`** for contact rows.

3. **Wire dismiss**: after opening a chat, dismiss the compose sheet so the user lands in the conversation.

---

## Phase 3: Group Creation

**Goal:** Create a new group chat with a name and selected members.

### Steps

1. **`NewGroupView.swift`** — two-step flow within a NavigationStack:
   - **Step 1 — Details:**
     - Group name text field (required, "Done" disabled until non-empty).
     - Optional avatar — tap to pick from PhotosPicker or CameraPicker (reuse existing patterns from `InstantOnboardingView`). Save to temp file for `setChatProfileImage`.
     - Optional description text field.
     - Verified toggle — when on, calls `createGroupChat(verified: true, ...)`. Only available when all selected members are verified (`contact.isVerified`).
   - **Step 2 — Members:** multi-select contact list with checkmarks and search. Self is always included (shown but non-removable).

2. **Multi-select contact picker** — `GroupMemberPicker.swift`:
   - List of contacts with checkmark toggle.
   - Search filtering.
   - `@Binding var selectedIds: Set<UInt32>`.
   - Reuse `AvatarView` for rows.

3. **Create on Done:**
   - `let chatId = context.createGroupChat(verified: verified, name: name)`
   - For each selected contact: `context.addContactToChat(chatId: chatId, contactId: id)`
   - If avatar set: `context.setChatProfileImage(chatId: chatId, path: imagePath)`
   - If description set: `context.setChatDescription(chatId: chatId, description: desc)`
   - `appState.openChat(id: chatId)` → dismiss all the way back.

---

## Phase 4: Channel (Broadcast List) Creation

**Goal:** Create an outgoing broadcast list with a name and selected recipients.

### Steps

1. **`NewChannelView.swift`** — same two-step pattern as `NewGroupView`:
   - **Step 1 — Details:** text field for channel name.
   - **Step 2 — Recipients:** multi-select contact picker (self NOT included — recipients only).

2. **Reuse `GroupMemberPicker`** from Phase 3.

3. **Create on Done:**
   - `let chatId = context.createBroadcastList()`
   - `context.setChatName(chatId: chatId, name: name)`
   - For each selected contact: `context.addContactToChat(chatId: chatId, contactId: id)`
   - `appState.openChat(id: chatId)` → dismiss.

---

## Phase 5: Group & Channel Editing

**Goal:** Edit name and members of existing groups/channels from the chat info screen.

### Steps

1. **Extend `ContactView.swift`** (the chat-info / contact-detail screen):
   - For group/broadcast chats, show:
     - Tappable avatar — pick new image via PhotosPicker/CameraPicker → `context.setChatProfileImage(chatId:path:)`.
     - Editable group/channel name field → `context.setChatName(chatId:name:)`.
     - Editable description field → `context.setChatDescription(chatId:description:)`.
     - Members list (loaded via `context.getChatContacts(chatId:)`).
     - "Add Members" button → pushes `GroupMemberPicker` with current members pre-selected.
     - Swipe-to-remove on member rows → `context.removeContactFromChat(chatId:contactId:)`.

2. **Leave group** action for group chats (not broadcast):
   - `context.removeContactFromChat(chatId: chatId, contactId: DC_CONTACT_ID_SELF)`.

---

## Open Questions / Deferred

- **Mailing lists** — read-only inbound lists. Display already works (chat type renders); creation not needed.
- **"New Email" action** — creating a chat by typing an email address directly. Defer to a contacts/address-book plan.
