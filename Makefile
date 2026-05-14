.PHONY: help icons submodules test-accounts test-e2e test-e2e-phase test-e2e-watch test-e2e-clean

help:
	@echo "qxp — top-level make targets"
	@echo
	@echo "  make icons              Regenerate visual assets from assets/logo.svg."
	@echo "                          Always writes the 4 gitignored text derivatives (pure Python)."
	@echo "                          Also rasterises the 2 committed PNGs if imagemagick is reachable."
	@echo
	@echo "  make submodules         Hard-reset all submodules to the pinned commits."
	@echo "                          Syncs URLs, force-checks out the recorded SHA, then"
	@echo "                          'git reset --hard' + 'git clean -fd' inside each."
	@echo "                          DESTRUCTIVE: discards local edits/untracked files in submodules."
	@echo "                          (Gitignored build caches like target/ are preserved.)"
	@echo
	@echo "  make test-accounts      Idempotent pool maintenance. Reads desktop/tests/.env;"
	@echo "                          re-registers any slot whose creds no longer authenticate."
	@echo "                          Spawns qxp-web and uses its RPC chain (no direct relay HTTP)."
	@echo
	@echo "  make test-e2e           Full E2E suite (Playwright + Chromium against the"
	@echo "                          Vite dev server; daemon spawned per-test on :9090)."
	@echo "  make test-e2e-phase PHASE=08-multi-account"
	@echo "                          Run a single phase directory under specs/."
	@echo "  make test-e2e-watch     Playwright UI mode (interactive runner + time-travel)."
	@echo "  make test-e2e-clean     Remove /tmp/qxp-* leftover account dirs and pool locks."

icons:
	@assets/scripts/generate-logo.py

submodules:
	git submodule sync --recursive
	git submodule update --init --recursive --force
	git submodule foreach --recursive git reset --hard
	git submodule foreach --recursive git clean -fd

# --- E2E test targets ---

test-accounts: desktop/server/target/debug/qxp-web desktop/tests/node_modules
	@node desktop/tests/scripts/ensure-pool.mjs

# Build the daemon if missing; this is the script's hard requirement.
desktop/server/target/debug/qxp-web:
	cd desktop/server && cargo build

# Install test deps lazily; touch the dir as a sentinel so we don't reinstall
# on every `make test-e2e` (mirrors the desktop/Makefile npm install pattern).
desktop/tests/node_modules: desktop/tests/package.json
	cd desktop/tests && npm install
	@touch desktop/tests/node_modules

test-e2e: test-accounts
	cd desktop/tests && npm test

# Run only the specs under `specs/$(PHASE)`. Skips the test-accounts
# precondition because the templates are already on disk after the
# first full run; rebuild explicitly with `make test-accounts` if pool
# creds rotated. Example: `make test-e2e-phase PHASE=08-multi-account`.
test-e2e-phase: desktop/tests/node_modules
	@if [ -z "$(PHASE)" ]; then \
		echo "usage: make test-e2e-phase PHASE=<dir>  (e.g. 08-multi-account)"; \
		exit 2; \
	fi
	cd desktop/tests && npm test -- specs/$(PHASE)

test-e2e-watch: test-accounts
	cd desktop/tests && npm run test:watch

test-e2e-clean:
	rm -rf /tmp/qxp-pool-init-* /tmp/qxp-e2e-* desktop/tests/.pool-lock.json
