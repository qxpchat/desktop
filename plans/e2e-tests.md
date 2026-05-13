# PLAN: qxp desktop — exhaustive E2E test suite

Regression safety net for the upcoming UI-primitive refactor (see `REVIEW.md`). Must be green before any refactor PR lands and stays green at every PR boundary.

## Mission

Exercise the entire user-visible desktop surface end-to-end through Playwright, against a real Tauri shell and a real chatmail relay. Tests are the spec; failing the suite blocks merging.

## Stack (locked in)

- **Driver:** `tauri-driver` (the official Tauri 2 WebDriver bridge), used via WebdriverIO for the test API. WebKit2GTK on Linux, WKWebView on macOS, WebView2 on Windows. Tests the *real* Tauri shell including drag regions, native menus, dock badge / icon hooks, and the `tauri://` URL handling.
- **App under test:** `target/debug/qxp-desktop` (built once via `cargo build` inside `src-tauri/`; rebuilt only when the Rust or build.rs changes). tauri-driver launches a fresh process per test, killed in the fixture's teardown.
- **Real relay:** Delta Chat-hosted chatmail relay at `nine.testrun.org` (= "nine-relay"). All pool accounts are real chatmail addresses on that relay. The qxp app already targets this relay as the `Instant` onboarding default (see `desktop/frontend/src/lib/state/onboarding.svelte.ts:86`, `dcaccount:nine.testrun.org`).
- **Account creation:** goes through the daemon's own RPC chain — `add_account` → `set_config_from_qr "dcaccount:nine.testrun.org"` → `configure` → `get_config "addr"` + `get_config "mail_pw"`. Identical to the production Instant flow, just driven by a script instead of the UI.
- **Account model:** fixed pool of pre-registered persistent accounts, creds in `desktop/tests/.env`, leased to tests via a fixture.
- **State isolation:** per-test reset — the accounts dir is wiped and re-onboarded for every test. ~15-30s startup cost per test is the price of bulletproof isolation.
- **Peer model:** one account drives the Tauri UI; other accounts in the test drive the daemon **directly via JSON-RPC on the same WebSocket** (one Tauri window, both halves of the conversation in the same daemon). Avoids the headaches of two Tauri instances + cross-process coordination.

## Scope

**In:**
- Every user-reachable feature in `desktop/frontend/src/{shell,chat,compose,info,qr,settings,onboarding}`.
- Multi-account flows.
- Real account/network behaviour against the live relay (delivery delays, encryption setup, vcard exchange).
- Visual regression snapshots for the surfaces the UI-primitive refactor touches.

**Out (this plan):**
- iOS share with iOS tests (different runtime).
- Performance benchmarks (separate concern).
- Fuzz / property-based tests of the Rust daemon (upstream's job).
- Load testing the relay (operations problem).
- True multi-window Tauri tests (single-window suffices; flagged for follow-up if the app gains a second window).

## Repository layout

```
desktop/tests/
  .env.example            # pool of 10 credential placeholders, committed
  .env                    # real creds, gitignored
  wdio.conf.ts            # WebdriverIO config; spawns tauri-driver, points at target/debug/qxp-desktop
  package.json            # webdriverio, @wdio/cli, @wdio/mocha-framework deps
  fixtures/
    app.ts                # `tauriApp` fixture: launches the built binary via tauri-driver, waits for window
    accounts.ts           # `pool` fixture: leases creds, asserts not in use, releases on teardown
    daemon.ts             # `daemon` fixture: direct JSON-RPC client for headless peers
    reset.ts              # `cleanAccountsDir` helper: deletes accounts dir, waits for daemon ready
    onboarding.ts         # `onboardedApp` fixture: tauriApp + completed instant onboarding for an account
  specs/
    01-onboarding/
      instant.spec.ts
      manual-login.spec.ts
      backup-import.spec.ts
      backup-receive.spec.ts
    02-chatlist/
      load-and-sort.spec.ts
      search.spec.ts
      pin.spec.ts
      mute.spec.ts
      archive.spec.ts
      mark-unread.spec.ts
      delete.spec.ts
    03-messaging/
      send-receive-text.spec.ts
      attachments-image.spec.ts
      attachments-video.spec.ts
      attachments-audio.spec.ts
      attachments-file.spec.ts
      voice.spec.ts
      vcard.spec.ts
      location-oneshot.spec.ts
      gif.spec.ts
    04-message-actions/
      reply.spec.ts
      forward.spec.ts
      edit.spec.ts
      delete.spec.ts
      delete-for-everyone.spec.ts
      copy.spec.ts
      reactions.spec.ts
      multi-select.spec.ts
    05-compose/
      one-to-one.spec.ts
      group.spec.ts
      channel.spec.ts
      contact-picker.spec.ts
    06-group-management/
      add-member.spec.ts
      remove-member.spec.ts
      change-name.spec.ts
      change-avatar.spec.ts
      change-image.spec.ts
      leave.spec.ts
      ephemeral-timer.spec.ts
    07-qr/
      show.spec.ts
      scan-paste.spec.ts
      verify.spec.ts
      group-join.spec.ts
    08-multi-account/
      add-second-account.spec.ts
      switch.spec.ts
      logout.spec.ts
      cross-account-isolation.spec.ts
    09-settings/
      profile.spec.ts
      appearance-theme.spec.ts
      appearance-accent.spec.ts
      appearance-wallpaper.spec.ts
      appearance-language.spec.ts
      chats-and-media.spec.ts
      blocked-contacts.spec.ts
      backup-export.spec.ts
      connectivity.spec.ts
      proxy.spec.ts
      logs.spec.ts
      about.spec.ts
    10-search/
      chatlist-search.spec.ts
      message-search-global.spec.ts
      message-search-in-chat.spec.ts
    11-media-browser/
      images.spec.ts
      videos.spec.ts
      files.spec.ts
      audio.spec.ts
      jump-from-tile.spec.ts
    12-drafts/
      persist-on-chat-switch.spec.ts
      hydrate-on-return.spec.ts
      clear-on-send.spec.ts
    13-cross-cutting/
      jump-from-search.spec.ts
      jump-from-quote.spec.ts
      jump-from-media-browser.spec.ts
      drag-drop-attach.spec.ts
      keyboard-shortcuts.spec.ts
      escape-handling.spec.ts
    14-visual-regression/
      buttons.spec.ts
      modals.spec.ts
      message-bubble-variants.spec.ts
      chat-list-row-variants.spec.ts
      empty-states.spec.ts
  helpers/
    selectors.ts          # canonical data-testid string constants
    expect.ts             # custom matchers (expectBubbleSent, expectChatRowUnread, etc.)
    timeouts.ts           # named timing constants (ARRIVAL_TIMEOUT_MS, etc.)
  scripts/
    ensure-pool.mjs       # idempotent pool registration / health check (see Make targets below)
    register-one.mjs      # internal helper used by ensure-pool: POST /new + IMAP verify
    probe-account.mjs     # internal helper: IMAP LOGIN + SELECT INBOX for one slot
```

## Account pool

10 chatmail addresses pre-registered against `qxp.chat`. Naming: `QXP_TEST_ACCT_<n>_EMAIL` / `QXP_TEST_ACCT_<n>_PASSWORD`, n ∈ 1..10. Stored in `desktop/tests/.env`; `.env.example` commits the placeholder shape.

**Pool sizing rationale:**
- 1:1 tests: 2 accounts.
- Group tests (≥3 members): 4 accounts comfortably.
- Channel/broadcast: 4-6 accounts.
- Forward (3+ destinations): 4 accounts.
- Multi-account-on-one-device: 3 accounts.
- Block/unblock: 2 accounts.
- Concurrent test runs (parallel mode in Playwright): need ~2× the peak per-test demand.

**10 covers all the above with comfortable headroom.** The pool size is one named constant; bumping to 12 or 20 is trivial.

**Leasing semantics:**
- `pool` fixture (per-test) leases the accounts the test declares it needs via `test.use({ poolSize: N })`.
- Lease file `desktop/tests/.pool-lock.json` (gitignored) tracks "in use" by pid. If a previous run crashed without releasing, the fixture forcibly reclaims after a 5-minute staleness check.
- Tests should not assume contiguous account numbers — accept whatever pool.lease(n) returns.

**Persistence trade-offs (chosen model):**
- Accounts persist on the relay between runs. Their inbox accumulates messages.
- The per-test reset wipes only the **local accounts dir**, not the relay-side mailbox. The first action of every test that uses an account is therefore `marknoticed_all_chats` to clear server-side fresh state.
- Periodic relay-side cleanup is the relay operator's responsibility (a separate cron / lifecycle script — out of scope for this plan).

## Test-id strategy

Tests use `data-testid` attributes exclusively for selectors. Text-based selectors are forbidden — they break under i18n changes and visual refactors.

**Naming convention:** kebab-case nouns, optionally with a numeric or string discriminator.

```
chat-list                       (the pane-2 chat list root)
chat-list-row[data-chat-id="123"]
chat-list-row__pin              (the pinned-icon dot inside a row)
chat-list-row__unread           (the unread badge inside a row)
context-menu
context-menu-item[data-action="forward"]
composer
composer__textarea
composer__send
composer__attach
message-bubble[data-msg-id="42"]
message-bubble__quote
message-bubble__text
chat-topbar__title
chat-topbar__call
modal[data-modal="delete-message"]
modal__primary
modal__cancel
back-button
search-input
search-input__clear
nav-tab[data-account-id="3"]
```

**Centralised in `helpers/selectors.ts`:**

```ts
export const TID = {
  chatList: '[data-testid="chat-list"]',
  chatListRow: (chatId: number) => `[data-testid="chat-list-row"][data-chat-id="${chatId}"]`,
  composer: '[data-testid="composer"]',
  composerTextarea: '[data-testid="composer__textarea"]',
  composerSend: '[data-testid="composer__send"]',
  messageBubble: (msgId: number) => `[data-testid="message-bubble"][data-msg-id="${msgId}"]`,
  // ...
} as const;
```

**Phase 0 sweep** adds `data-testid` to all the components the suite touches. The list emerges naturally from drafting Phase 1's first spec; ~60-80 attributes total. Adding them is mechanical and rare (zero behaviour change), so it can land as a single PR.

## Fixtures

### `app` fixture

```ts
export const test = base.extend<{ app: TauriApp }>({
  app: async ({}, use, testInfo) => {
    const dir = await mkTempAccountsDir(testInfo);
    const proc = await spawnTauriDev({ accountsDir: dir, port: pickPort() });
    const browser = await connectPlaywrightToWebview(proc.debugPort);
    const page = await browser.contexts()[0].pages()[0];
    await page.waitForSelector(TID.appReady);
    await use({ proc, page, dir });
    await proc.kill();
    await fs.rm(dir, { recursive: true });
  },
});
```

**Notes:**
- `accountsDir` lives under `/tmp/qxp-e2e-<pid>-<test>/accounts`; full delete on teardown.
- `pickPort()` finds a free TCP port for the daemon's WebSocket — Tauri dev's default 9090 collides if tests run in parallel.
- `cargo tauri dev` is heavy. After the first build (cold cache), subsequent launches are ~3-8s. The Playwright `webServer` option could cache a build but we deliberately don't — each test gets a virgin process to guarantee the daemon's state matches its accounts dir.

### `pool` fixture

```ts
export const test = base.extend<{ pool: AccountPool }>({
  pool: async ({}, use) => {
    const leased = await leaseAccounts(testInfo.titlePath, testInfo.workerIndex);
    await use(leased);
    await releaseAccounts(leased);
  },
});
```

Each `Account` has `{ email, password, displayName }` and a `daemonRpc()` accessor that returns a typed wrapper over `rpc.call(...)` for that account, used by peer-driving code.

### `onboarded` fixture (composes `app` + `pool`)

```ts
export const test = base.extend<{ onboarded: OnboardedApp }>({
  onboarded: async ({ app, pool }, use) => {
    const main = pool.lease(1)[0];
    await app.page.fill(TID.onboardingAddr, main.email);
    await app.page.fill(TID.onboardingPwd, main.password);
    await app.page.click(TID.onboardingSubmit);
    await app.page.waitForSelector(TID.chatList);
    await use({ ...app, main });
  },
});
```

99% of tests need a logged-in app. Only the four onboarding specs use the bare `app` fixture.

### `daemon` fixture (headless peer)

```ts
// Connect to the same daemon the Tauri shell is using, but with a fresh RPC
// session. Use this for peer accounts.
export type PeerHandle = {
  send(chatId: number, data: MessageData): Promise<number>;
  createContact(addr: string, name: string): Promise<number>;
  createChatByContactId(contactId: number): Promise<number>;
  // ... wrappers for every RPC the tests need
};
```

Created from the `app` fixture's daemon port. Each peer's `accountId` is resolved via `get_all_account_ids` after `pool.daemonAdd(account)`.

## Two-peer test pattern

```ts
test('peer sends text → bubble appears', async ({ onboarded, pool }) => {
  const peer = await pool.addAsPeer(onboarded, 2);
  const chat = await peer.createDmTo(onboarded.main.email);
  await peer.send(chat.id, { text: 'hello', viewtype: 'Text' });

  const bubble = onboarded.page.locator(TID.messageBubbleByText('hello'));
  await expect(bubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
});
```

`ARRIVAL_TIMEOUT_MS` defaults to 30s — chatmail delivery is "fast" but not deterministic. For mature suites, this can drop to 5-10s once we know typical p99.

## Coverage matrix (by phase)

Each phase below lists its specs and the user-visible behaviour each one locks in. Tests *don't* test internals (RPC method names, state-module field shapes); they only assert what the user sees.

### Phase 0 — infrastructure (no specs yet)

**Goal:** test harness compiles and runs against a smoke spec.

**Deliverables:**
- `playwright.config.ts`, `package.json` `test:e2e` script.
- `fixtures/app.ts`, `fixtures/accounts.ts`, `fixtures/onboarding.ts`, `fixtures/daemon.ts`, `fixtures/reset.ts`.
- `helpers/selectors.ts`, `helpers/expect.ts`, `helpers/timeouts.ts`.
- `data-testid` sweep across the components Phase 1-3 will exercise (a starting set of ~25 attributes — the rest are added per phase as needed).
- Account pool registration script: `scripts/register-pool.mjs` that consumes a token-URL list from the relay operator and writes `.env`.
- Smoke spec: launches the app, sees the onboarding screen, exits cleanly.

**Acceptance:** `npm run test:e2e -- specs/00-smoke` passes locally on macOS in <60s.

### Phase 1 — onboarding (4 specs)

- `instant.spec.ts` — display name + tap "Continue" → chatlist visible, profile rail shows the configured account.
- `manual-login.spec.ts` — fills addr + IMAP/SMTP creds → reaches chatlist; bad creds → error banner.
- `backup-import.spec.ts` — picks a backup file → progress overlay → chatlist hydrated with backup's chats.
- `backup-receive.spec.ts` — full QR-pair → second device → both ends meet → chatlist sync starts.

### Phase 2 — chat list (7 specs)

- Load + sort (pinned-first, last-message-recency).
- Search (chatlist filter only — message-search is in Phase 10).
- Pin / unpin → row jumps to top of list / falls back.
- Mute / unmute → bell-off icon present / absent.
- Archive / unarchive → archive link appears / disappears.
- Mark-as-unread / mark-as-read → manual badge appears, opens-and-clears.
- Delete chat / leave group → row vanishes, daemon confirms.

### Phase 3 — 1:1 messaging (9 specs)

Each spec sends from peer, expects bubble on main; then sends from main, expects state glyph progression `pending → delivered → read`.

- text, image, video, audio, file, voice, vcard, location-oneshot, gif.

### Phase 4 — message actions (8 specs)

Reply, forward (single dest), forward (multi-dest), edit, delete-for-me, delete-for-everyone, copy, reactions (toggle + multi-emoji).

### Phase 5 — multi-message selection (1 spec)

Right-click → "Select More" → 5 bubbles via click-toggle → selection bar shows "5 selected" → bulk Delete via dialog → all gone. Then a second pass for bulk Forward.

### Phase 6 — compose flows (4 specs)

- 1:1 chat creation via contact picker (existing contact + new email-only contact).
- Group creation: pick members → name + avatar → first message.
- Channel creation: pick subscribers → name → first message.
- ContactPicker accepts a fresh email address (creates the contact).

### Phase 7 — group management (7 specs)

Add member, remove member, change name, change avatar (upload), change channel image (for broadcasts), leave, ephemeral timer.

### Phase 8 — QR (4 specs)

- Show QR for own contact / for group.
- Scan-paste path (paste a QR URL into the Scanner).
- Verify (peer's contact gets verified shield).
- Group-join via QR.

### Phase 9 — multi-account (4 specs)

- Add second account → NavTabs shows two avatars.
- Switch → chatlist swaps, page title updates.
- Logout → row disappears, switches to remaining; if last → empty-onboarding.
- Cross-account isolation: chat in account A invisible from account B.

### Phase 10 — settings (12 specs)

One spec per settings section; verifies the surface is reachable, mutations round-trip through the daemon (read back via the daemon fixture).

### Phase 11 — search (3 specs)

- Chatlist filter (existing chat title).
- Global message-text search → click hit → jumps to bubble.
- In-chat find (Ctrl+F) → next/prev cycle, esc closes.

### Phase 12 — media browser (5 specs)

- Tabs (images / videos / audio / files) populate from a chat that has each kind.
- Tile click → fullscreen lightbox.
- Empty tab shows the empty state.
- Jump-from-tile → chat view scrolls to that bubble (paginating if old).
- Delete from media browser propagates to chat view.

### Phase 13 — drafts (3 specs)

- Type, switch chat, return → text preserved.
- Send → draft cleared.
- Per-chat isolation: drafts don't leak across chats.

### Phase 13 — cross-cutting (6 specs)

- Jump from global search.
- Jump from quote tap (target outside loaded window → paginates).
- Jump from media browser.
- Drag-drop image → composer attaches, sends.
- Keyboard shortcuts (Ctrl+N, Ctrl+K, Ctrl+F, Esc).
- Window blur/focus marks chats noticed appropriately.

### Phase 14 — visual regression (4 specs)

Playwright `toHaveScreenshot()` against pinned reference images. Runs **after** the UI-primitive refactor each PR; first run after a PR auto-updates references that the reviewer must inspect.

- Button variants (primary, secondary, danger, ghost, icon — each in idle / hover / disabled / focus).
- Modals (delete dialog, forward picker, lightbox).
- MessageBubble variants (incoming / outgoing / media / quote / reactions / edited / failed).
- ChatListRow variants (unread / muted / pinned / manual-unread / archived).

Visual specs are platform-stable only on macOS (font rendering varies on Linux/Windows). Until a Linux/Windows CI runner ships its own baselines, these specs are macOS-only via WebdriverIO's `before(function () { if (process.platform !== 'darwin') this.skip(); })`.

## Plumbing pre-requisites

Before Phase 0 can start:

1. **`tauri-driver` installed and on PATH.** `cargo install tauri-driver`. tauri-driver speaks WebDriver to whatever WebView backend the platform uses (WKWebView on macOS, webkit2gtk on Linux, WebView2 on Windows). The WebdriverIO suite spawns it on a known port and connects.
2. **Debug build of the Tauri shell available** at `desktop/src-tauri/target/debug/qxp-desktop`. `make test-e2e` ensures this via a `cargo build` prerequisite; fast incremental builds after the first.
3. **`qxp-web` (the daemon) buildable as a standalone binary** for the pool-registration script. It already is — `cargo run --bin qxp-web -- --listen 127.0.0.1:0 --accounts-dir <tmp>` is enough.
4. **macOS specifics: TCC.** Tests that exercise the camera (QR scanner) need camera permission. `tccutil reset Camera chat.qxp.desktop` between runs + native TCC prompts can't be auto-dismissed via WebDriver. Resolution: stub the QR scanner with a deterministic test mode that injects a known QR string when `QXP_TEST_MODE=1` is set. Live-camera path stays untested at the E2E layer (manual smoke).

## Make targets

All E2E targets nest under the top-level `Makefile` (root of repo) and forward into `desktop/Makefile` where appropriate. The lifecycle target is **`make test-accounts`** — idempotent, fast on the happy path (pool is healthy), self-healing on the cold path (missing or stale accounts).

```makefile
# root Makefile
.PHONY: test-accounts test-e2e test-e2e-watch test-e2e-update test-e2e-ui

# Idempotent pool maintenance. Verifies every QXP_TEST_ACCT_<n> in
# desktop/tests/.env still authenticates against the relay; missing or
# broken accounts are re-registered and the new creds are written back
# to .env. Safe to run every time, the happy path is one HEAD per acct.
test-accounts:
	@node desktop/tests/scripts/ensure-pool.mjs

# Pre-requisite for everything else: the pool must be healthy.
test-e2e: test-accounts
	@cd desktop && nix-shell --run "npm --prefix tests run test"

test-e2e-watch: test-accounts
	@cd desktop && nix-shell --run "npm --prefix tests run test:watch"

test-e2e-update: test-accounts
	@cd desktop && nix-shell --run "npm --prefix tests run test:update-snapshots"

test-e2e-ui: test-accounts
	@cd desktop && nix-shell --run "npm --prefix tests run test:ui"
```

### `ensure-pool.mjs` — what it actually does

```
desktop/tests/scripts/ensure-pool.mjs
```

The script never talks to the relay directly — it drives the same JSON-RPC chain the app's `Instant` onboarding flow uses. The daemon (`qxp-web`) handles the chatmail protocol; the script just calls RPCs.

1. **Boot a throwaway daemon.** Spawn `cargo run --bin qxp-web -- --listen 127.0.0.1:0 --accounts-dir /tmp/qxp-pool-init-<pid>`. Capture the bound port from the daemon's `listening on …` log line. Open a WebSocket JSON-RPC client to `ws://127.0.0.1:<port>/ws`.
2. **For each slot `1..POOL_SIZE`:**
   - **Probe.** If both `QXP_TEST_ACCT_<n>_EMAIL` and `_PASSWORD` are present in `.env`:
     - `add_account` → `accountId`.
     - `set_config(accountId, "addr", email)`; `set_config(accountId, "mail_pw", password)`.
     - `configure(accountId)` — this hits the relay. Success ⇒ healthy slot.
     - `remove_account(accountId)` — cleanup; the script's daemon stays disposable.
   - **Re-register** if the slot is empty or `configure` threw:
     - `add_account` → `accountId`.
     - `set_config(accountId, "displayname", "qxp e2e <n>")`.
     - `set_config_from_qr(accountId, "dcaccount:nine.testrun.org")`.
     - `configure(accountId)`. On success the daemon has minted a fresh chatmail address.
     - `get_config(accountId, "addr")` → new email.
     - `get_config(accountId, "mail_pw")` → new password.
     - Update `.env` in-memory.
     - `remove_account(accountId)` — same cleanup.
3. **Write back.** After all slots are processed, write `desktop/tests/.env` atomically (`.env.tmp` → `rename`). Preserve any other keys present.
4. **Tear down.** Kill the daemon, `rm -rf /tmp/qxp-pool-init-<pid>`.
5. **Summary.** Print `healthy: N / refreshed: M / failed: F` and exit non-zero if `F > 0`.

The script is deliberately RPC-only: any future change to chatmail's underlying protocol is absorbed by the daemon, not by the script. The plan therefore *does not depend* on the relay exposing a particular HTTP API.

### Variables the script reads

From `desktop/tests/.env` (or the surrounding shell env, env wins):

| Var | Meaning | Default |
|---|---|---|
| `QXP_TEST_RELAY_QR` | The `dcaccount:` QR URL that `set_config_from_qr` consumes | `dcaccount:nine.testrun.org` |
| `QXP_TEST_POOL_SIZE` | Number of accounts to maintain | `10` |
| `QXP_TEST_ACCT_<n>_EMAIL` | Email for slot n | (filled by script) |
| `QXP_TEST_ACCT_<n>_PASSWORD` | Password for slot n | (filled by script) |
| `QXP_TEST_DISPLAY_NAME_PREFIX` | Display name prefix the script assigns (`<prefix> <n>`) | `qxp e2e` |

### Cold-start flow

A new developer or fresh CI runner runs `make test-e2e`:

1. `test-accounts` target fires.
2. `ensure-pool.mjs` reads `desktop/tests/.env` → finds no `QXP_TEST_ACCT_*` keys.
3. Script registers 10 accounts via `POST /new`, IMAP-verifies each, writes `.env`. ~30-60s (network bound).
4. `make test-e2e` continues with the pool now populated.

Subsequent runs:

1. `ensure-pool.mjs` reads `.env` → finds 10 entries.
2. IMAP-probes each → 10 `OK` responses, ~3s total (parallelisable).
3. Exits with `healthy: 10 / refreshed: 0`. `make test-e2e` proceeds immediately.

### What happens when an account dies

The relay rotates passwords or culls inactive mailboxes. After a long break:

1. `ensure-pool.mjs` probes → some slots fail IMAP `AUTHENTICATIONFAILED`.
2. Those slots get re-registered via `POST /new`, new creds written.
3. The local accounts dir for any test using that slot will have stale chatmail addresses — but since per-test reset wipes the accounts dir anyway, this self-heals on next run.
4. **Peer-side caveat:** other accounts in the pool still have the dead account in their contact list / chat history. The first action of every multi-account test should be `marknoticed_all_chats` to clear server-side residue.

### `.env.example` shape (committed)

```dotenv
# E2E pool config. Pool is populated automatically against the chatmail
# relay specified by QXP_TEST_RELAY_QR via the deltachat-core JSON-RPC
# `configure` flow — the daemon does the actual relay protocol.
# Run `make test-accounts` to register a fresh pool.

QXP_TEST_RELAY_QR=dcaccount:nine.testrun.org
QXP_TEST_POOL_SIZE=10
QXP_TEST_DISPLAY_NAME_PREFIX="qxp e2e"
# QXP_TEST_ACCT_1_EMAIL=…       (auto-filled by ensure-pool.mjs)
# QXP_TEST_ACCT_1_PASSWORD=…    (auto-filled)
# QXP_TEST_ACCT_2_EMAIL=…
# …
```

The `.env` is gitignored; only `.env.example` ships in the repo.

### Make targets (full list)

```
make test-accounts          # idempotent pool maintenance
make test-e2e               # full suite (depends on test-accounts)
make test-e2e-watch         # single-spec re-runner
make test-e2e-update        # accept current screenshots as new visual-snapshot baselines
make test-e2e-ui            # Playwright's interactive runner
make test-e2e-clean         # nuke /tmp/qxp-e2e-* leftover account dirs and pool lock
```

## Open questions

Each one is decideable but I'd rather have the answers before drafting the first spec. Numbers in parens are how much each affects the design.

1. **Q: Should visual regression tests run on Linux/Windows too?** (small) Font rendering varies; pinning baselines per-platform is doable but adds CI complexity. Default: macOS-only Phase 16, revisit later.

2. **Q: When the suite finds a flake (real timing race), what's the policy?** (medium) Three options:
   - Mark the spec `it.skip` until fixed.
   - Retry on failure (WebdriverIO `mochaOpts.retries: 1`) and surface flakiness via report.
   - Block CI on first failure, force a fix-in-place.
   Default: `retries: 1` locally, `retries: 0` on CI (when CI lands). Flaky tests get an issue + `skip`.

3. **Q: Test parallelism.** (medium) WebdriverIO supports `maxInstances` for parallel sessions. Each test launches its own Tauri instance + tauri-driver session. Hard cap: pool size ÷ accounts-per-test. Typical Phase 3 spec uses 2 accounts → 5 parallel workers on a 10-account pool. Acceptable for local; CI runner sizing TBD.

4. **Q: Snapshot location.** (small) `tests/__snapshots__/` or per-spec `tests/specs/.../__snapshots__/`. Default to colocated. Snapshot library: `@wdio/visual-service` is the established choice.

5. **Q: Should the daemon-fixture peers reach the same `accounts_dir` as the Tauri shell, or run a second daemon?** (medium) Same dir is simpler (one process, two accounts). The Tauri shell already spawns the daemon — peer accounts just `add_account` against it. Default: same dir. The only catch: peer accounts in the same daemon share IO threads with the main account, so concurrent ops may serialise more than they would in production. Acceptable trade-off for test simplicity.

6. **Q: How do we test what happens when the relay is down?** (small) Out of scope for the first iteration. Eventually: a stub mode where the daemon points at a non-resolving SMTP, and we assert the offline UX (send queue, retry, error banner).

## Phase ordering and dependencies

```
0 (infra)
  ↓
1 (onboarding)  → unlocks every subsequent phase via the `onboarded` fixture
  ↓
2 (chatlist)  ← independent of 3+
  ↓
3 (1:1 messaging)
  ↓
4 (message actions), 5 (multi-select)  ← both build on 3's bubble assertions
  ↓
6 (compose), 7 (group management), 8 (QR)  ← parallel branches; 9 needs 8
  ↓
9 (multi-account)
  ↓
10 (settings), 11 (search), 12 (media), 13 (drafts)
  ↓
14 (cross-cutting), 15 (visual regression)
```

Phases 0-5 are the **critical-path subset** for unblocking the UI-primitive refactor: they cover all the components the refactor touches in the highest-traffic surfaces (chat list, chat view, modals, buttons). The refactor can start once Phases 0-5 are green; the remaining phases can land in parallel with the refactor PRs.

## Success criteria

The plan ships when:

- All 15 phases (0 through 14, plus visual regression at 15) have specs + are green on macOS locally.
- `make test-e2e` runs the full suite in <20 minutes on a developer laptop (5 parallel workers, 10-account pool).
- Each spec is independent (can run in any order, in any combination).
- A new feature can't merge without an accompanying spec in the matching phase directory.
- The UI-primitive refactor (REVIEW.md, Top 3 item 1) lands one PR at a time, each PR green.

## Out-of-scope follow-ups (separate plans)

- CI integration (GitHub Actions / Drone / whatever). Local-first; CI lands after the suite is stable.
- Cross-platform CI (Linux/Windows runners with platform-specific snapshots).
- Performance regression detection (bubble-render LOC, scroll FPS, etc.).
- Property-based fuzzing of the JSON-RPC surface.
- Network-fault testing (relay-down, packet-loss, slow-network).
- Concurrent multi-window / multi-instance tests (require the app to ship a second window first).
