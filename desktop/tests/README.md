# qxp desktop — E2E tests

Playwright + Chromium against the Vite dev server, real `qxp-web` daemon spawned per-test, real chatmail relay (`nine.testrun.org`). See `plans/e2e-tests.md` for the full coverage matrix.

## One-time setup

```sh
cd desktop/server && cargo build         # daemon used by ensure-pool + tests
cd desktop/tests && npm install          # Playwright + helpers
cd desktop/tests && npx playwright install chromium  # browser binary
```

## Run the suite

From the repo root:

```sh
make test-accounts        # idempotent pool maintenance, ~3s on the happy path
make test-e2e             # full suite (depends on test-accounts)
make test-e2e-watch       # Playwright UI mode (time-travel debugger)
make test-e2e-update      # accept current screenshots as new visual baselines
make test-e2e-clean       # nuke /tmp/qxp-* leftover account dirs and the pool lock
```

`make test-e2e` chains: build daemon → install deps → ensure-pool → Playwright spawns Vite → tests.

## How it works

**One Vite dev server, many daemons.** Playwright's `webServer` config starts `npm --prefix frontend run dev` once for the whole suite. Each test's `qxp` fixture spawns its own `qxp-web` daemon at `127.0.0.1:4041` against a fresh accounts dir, then tears it down. Vite proxies `/ws` to that port — so each test gets a clean daemon state without restarting the SPA.

**Serialised by default.** Workers pinned to 1 because the daemon hardcodes :4041. Future work can plumb per-worker ports through to support `workers: N`.

**Cross-account testing.** When a test needs two peers, the second account is driven *headlessly* — direct JSON-RPC over the same WebSocket the SPA uses. One daemon, two accounts, one Tauri-less window. See the test plan's "Two-peer test pattern" section.

## Pool lifecycle

`desktop/tests/.env` holds 10 chatmail accounts registered against `nine.testrun.org`. The file is **gitignored** — never commit it.

- Cold start (no `.env`): `make test-accounts` registers 10 fresh accounts, ~30-60 s of network.
- Warm start (pool healthy): probes each slot via `configure`, ~3 s total.
- Stale slots: any slot whose existing creds fail `configure` is silently re-registered and `.env` is rewritten.

All of this goes through the qxp-web daemon's own JSON-RPC chain (`add_account` → `set_config_from_qr` → `configure` → `get_config`); no direct relay HTTP. If the relay changes its protocol, the daemon absorbs it.

## What this stack does *not* test

We're running Chromium against the Vite SPA, not the Tauri shell. So:

- **Not covered:** `set_dock_icon` / `set_badge` (macOS dock), drag-region behaviour, `tauri://` URL routing, `@tauri-apps/plugin-opener` external-link intercept, native menus.
- **Mostly fine:** the WebView gap (Chromium in tests vs WKWebView on prod Mac) — most user-facing surface is identical. The realistic edge cases are `MediaRecorder` mime-type for voice messages and `BarcodeDetector` for the QR scanner; the latter is stubbed via `QXP_TEST_MODE`.

If you need Tauri-shell-level tests later, the path is a separate Linux-only `tauri-driver` suite in CI.

## Layout

```
desktop/tests/
  .env.example         Pool config template (committed).
  .env                 Real creds (gitignored).
  package.json         Playwright + ws + dotenv.
  playwright.config.ts Vite webServer + Chromium project.
  tsconfig.json
  helpers/
    selectors.ts       Canonical data-testid string constants.
    timeouts.ts        Named timing constants (ARRIVAL_TIMEOUT_MS, …).
  fixtures/
    app.ts             test fixture: spawns daemon, navigates page, tears down.
    accounts.ts        leaseAccounts / releaseAccounts — pool fixture.
  scripts/
    ensure-pool.mjs    Idempotent pool registration / health check.
  specs/
    00-smoke/          Phase 0: harness sanity check.
    01-onboarding/     Phase 1: instant / manual / backup-import / backup-receive.
    …
```

## Adding a test

1. Pick the matching phase directory under `specs/`.
2. Import `test, expect` from `../../fixtures/app.js` (the wrapped Playwright `test` with the `qxp` fixture).
3. Use `TID.*` selectors from `helpers/selectors.ts` — never raw text or class names.
4. For "peer sends a message" assertions: lease a second account via `accounts.leaseAccounts(N)` and drive it via direct JSON-RPC (helper landing as `fixtures/daemon.ts` in a follow-up).
