# PLAN: UIKit Navigation Shell

## Context

SwiftUI's `TabView` + `NavigationStack` cannot replicate UIKit's `hidesBottomBarWhenPushed` behaviour. The tab bar re-appears with a ~1s delay on pop instead of animating in sync with the interactive gesture. Every workaround (direct `tabBar.isHidden` manipulation, transition coordinator hacks) conflicts with SwiftUI's safe area management and breaks scroll positions.

Signal-iOS and deltachat-ios both use UIKit for navigation structure (`UITabBarController` → `UINavigationController` per tab) with `hidesBottomBarWhenPushed = true` on each pushed VC. This is the only mechanism that gives gesture-synced tab bar animation.

**Solution:** Replace the SwiftUI `TabView` and `NavigationStack` with a UIKit shell (`UITabBarController` + `UINavigationController`). Individual views remain SwiftUI, hosted in `UIHostingController`.

### Scope

- Replace `MainTabView` (SwiftUI TabView) → `MainTabBarController` (UITabBarController)
- Replace `ChatListView`'s NavigationStack → UINavigationController with imperative push/pop
- Every pushed VC gets `hidesBottomBarWhenPushed = true`
- Pull-down search bar via `UISearchController` on the chat list's `navigationItem`
- Native UIKit tap highlighting on chat list rows
- Chat view always scrolled to bottom on open (no safe-area race)
- ProfilesView keeps its own SwiftUI NavigationStack (no tab bar interaction needed)

### Not in scope

- Replacing the chat message list (ScrollView) with UIKit
- Rewriting ProfilesView as UIKit
- Changes to any view model logic

---

## Phase 1: UIKit Navigation Shell

**Goal:** Replace SwiftUI TabView and NavigationStack with UIKit containers. Tab bar hides/shows in sync with push/pop gesture.

### Steps

1. **Create `MainTabBarController`** (`qxp/Navigation/MainTabBarController.swift`)
   - `UITabBarController` subclass, `@MainActor`
   - Two tabs: Profiles (UINavigationController → UIHostingController of ProfilesContent), Chats (UINavigationController → ChatListTableViewController)
   - Both tabs use UINavigationController; all pushed VCs get `hidesBottomBarWhenPushed = true`
   - Accepts `AppState` and `AppearanceSettings` environments; passes them through hosting controllers
   - Tab bar items: "Profiles" with avatar icon, "Chats" with bubble icon
   - Observes `appState.selectedTab` for programmatic tab switches

2. **Create `ChatListTableViewController`** (`qxp/Navigation/ChatListTableViewController.swift`)
   - `UITableViewController` with self-sizing cells using `UIHostingConfiguration` (iOS 16+ cell content configuration with SwiftUI views — like Signal's UITableView but with SwiftUI cell content)
   - Each cell hosts `ChatListRow` via `UIHostingConfiguration { ChatListRow(chat:) }`
   - Native selection highlighting (`.selectionStyle = .default`)
   - Swipe actions via `UITableViewDelegate` trailing/leading swipe
   - Sets `navigationItem.searchController` (UISearchController) for pull-down search
   - Sets `title = "Chats"`, toolbar: compose button (trailing)
   - Data source: reads from `ChatListViewModel`, reloads via diffable data source

3. **Create `NavigationRouter`** (`qxp/Navigation/NavigationRouter.swift`)
   - `@Observable @MainActor` class stored on `AppState`
   - Holds `weak var chatsNavigationController: UINavigationController?`
   - Methods: `pushChat(id:)`, `pushChat(id:highlightMsg:)`, `pushContact(chatId:contactId:)`, `pushArchived()`, `popToRoot()`
   - Each push wraps the SwiftUI view in a `UIHostingController` with `hidesBottomBarWhenPushed = true`

4. **Refactor `AppState`**
   - Remove `chatPath: NavigationPath` — replaced by UIKit nav stack
   - Add `var router: NavigationRouter?` (set by MainTabBarController on init)
   - `openChat(id:)` calls `router?.pushChat(id:)`
   - Remove `selectedTab` binding dance — use `router?.selectTab(_:)` instead

5. **Refactor `ChatListView` → `ChatListContent`**
   - Strip `NavigationStack`, `navigationDestination`, `searchable` modifiers
   - The view becomes a plain List body that calls `appState.router?.pushChat(id:)` on tap
   - Search handled by UISearchController (phase 2); remove SwiftUI `.searchable`

6. **Wire into `qxpApp.swift` / `RootView`**
   - When `appState.isLoggedIn`, present `MainTabBarController` via a `UIViewControllerRepresentable` bridge instead of `MainTabView()`

7. **Delete `MainTabView.swift`** and the `.toolbar(…, for: .tabBar)` hack in SharedExtensions

### Expected outcome

- Tab bar animates in sync with interactive push/pop (native UIKit behaviour)
- No SwiftUI safe-area conflicts
- All views remain SwiftUI (just hosted in UIHostingControllers)
- `appState.router.pushChat(id:)` is the single entry point for navigation

---

## Phase 2: Signal-style Chat List Polish

**Goal:** Chat list matches Signal's look and feel — native tap highlighting, pull-down search, correct scroll on open.

### Steps

1. **Tap highlighting** — handled natively by UITableView cell selection (`.selectionStyle = .default`). No custom button styles needed.

2. **Pull-down search** — `UISearchController` configured on `ChatListHostingController.navigationItem`. Search text piped to `ChatListViewModel.searchText`. Results shown in the same list (toggle via viewModel.isSearching).

3. **Chat view scroll** — Remove the `DispatchQueue.main.async` scroll workaround in ChatView.onAppear. With UIKit navigation, the safe area is stable before the view appears — `ScrollPosition(edge: .bottom)` works correctly from the start.

4. **Remove dead code** — Delete `SharedExtensions.swift` tab-bar section, unused NavigationPath references, the `ChatMessageDestination`/`ArchivedRoute`/`ContactRoute` Hashable structs (navigation is now imperative, not type-erased path-based).

---

## Phase 3: Cleanup & Verification

**Goal:** Remove all SwiftUI navigation workarounds, verify no regressions.

### Steps

1. Remove `.toolbar(.hidden, for: .tabBar)` / `.toolbarBackground(.hidden, for: .tabBar)` from ChatView
2. Remove `hidesTabBar()` extension and `TabBarHiderController` remnants from SharedExtensions
3. Verify: push/pop gesture syncs tab bar, search works, scroll position correct, profiles tab unaffected
4. Run test suite

---

## Decisions

- **Profiles tab:** UIKit navigation too (consistency). ProfilesView content hosted in UIHostingController, pushed views get `hidesBottomBarWhenPushed = true`.
- **Chat list:** UITableView with self-sizing UIHostingConfiguration cells (Signal pattern). Native tap highlighting, swipe actions, no SwiftUI List quirks.
