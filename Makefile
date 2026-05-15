.PHONY: help server ui tauri-dev tauri-build build check assets clean submodules \
        test-accounts test-e2e test-e2e-phase test-e2e-watch test-e2e-clean

help:
	@echo "qxp desktop — make targets"
	@echo
	@echo "  make tauri-dev          Run the full Tauri app (daemon + Vite + native window)"
	@echo "  make tauri-build        Bundle a release build (single-binary desktop app)"
	@echo
	@echo "  make server             Run only the Rust daemon (server/)        [127.0.0.1:4041]"
	@echo "  make ui                 Run only the Vite dev server              [0.0.0.0:4040]"
	@echo "  make build              Production build of the frontend (dist/)"
	@echo "  make check              Run svelte-check on the frontend"
	@echo "  make assets             Regenerate logo + icon set from assets/logo.svg"
	@echo "  make clean              Remove target/, node_modules/, dist/"
	@echo
	@echo "  make submodules         Hard-reset all submodules to the pinned commits."
	@echo "                          DESTRUCTIVE: discards local edits/untracked files in submodules."
	@echo
	@echo "  make test-accounts      Idempotent E2E pool maintenance. Reads tests/.env;"
	@echo "                          re-registers any slot whose creds no longer authenticate."
	@echo "  make test-e2e           Full E2E suite (Playwright + Chromium against the Vite"
	@echo "                          dev server; daemon spawned per-test)."
	@echo "  make test-e2e-phase PHASE=08-multi-account"
	@echo "                          Run a single phase directory under specs/."
	@echo "  make test-e2e-watch     Playwright UI mode (interactive runner + time-travel)."
	@echo "  make test-e2e-clean     Remove /tmp/qxp-* leftover account dirs and pool locks."

server:
	cd server && cargo run

ui:
	cd frontend && npm run dev -- --host

tauri-dev: frontend/node_modules
	cd src-tauri && cargo tauri dev

tauri-build: frontend/node_modules
	cd src-tauri && cargo tauri build

# Treat node_modules as an order-dependent target so the npm install only
# runs on a fresh clone (or after a manual `rm -rf node_modules`). Avoids
# the "sh: vite: command not found" trap.
frontend/node_modules: frontend/package.json
	cd frontend && npm install
	@touch frontend/node_modules

build:
	cd frontend && npm run build

check: frontend/node_modules
	cd frontend && npm run check

# Regenerate every icon from assets/logo.svg, in two stages:
#   1. generate-logo.py rasterises the logomark into src-tauri/icons/icon.png
#      (1024 RGBA) and refreshes the frontend favicon + TS path constants.
#   2. `tauri icon` expands that PNG into the platform bundle set referenced
#      by tauri.conf.json (.icns, .ico, sized PNGs, Windows Square logos).
# `tauri icon` rewrites icon.png to 512px and emits android/ios dirs this
# desktop-only app never bundles — drop them and restore the 1024 source.
# Uses npx so it runs without a global tauri-cli install.
assets:
	python3 assets/scripts/generate-logo.py
	cd src-tauri && npx --yes @tauri-apps/cli@2 icon icons/icon.png
	rm -rf src-tauri/icons/android src-tauri/icons/ios
	cp assets/generated/desktop-icon.png src-tauri/icons/icon.png

clean:
	rm -rf server/target src-tauri/target frontend/node_modules frontend/dist

submodules:
	git submodule sync --recursive
	git submodule update --init --recursive --force
	git submodule foreach --recursive git reset --hard
	git submodule foreach --recursive git clean -fd

# --- E2E test targets ---

test-accounts: server/target/debug/qxp-web tests/node_modules
	@node tests/scripts/ensure-pool.mjs

# Build the daemon if missing; this is the script's hard requirement.
server/target/debug/qxp-web:
	cd server && cargo build

# Install test deps lazily; touch the dir as a sentinel so we don't reinstall
# on every `make test-e2e`.
tests/node_modules: tests/package.json
	cd tests && npm install
	@touch tests/node_modules

test-e2e: test-accounts
	cd tests && npm test

# Run only the specs under `specs/$(PHASE)`. Skips the test-accounts
# precondition because the templates are already on disk after the
# first full run; rebuild explicitly with `make test-accounts` if pool
# creds rotated. Example: `make test-e2e-phase PHASE=08-multi-account`.
test-e2e-phase: tests/node_modules
	@if [ -z "$(PHASE)" ]; then \
		echo "usage: make test-e2e-phase PHASE=<dir>  (e.g. 08-multi-account)"; \
		exit 2; \
	fi
	cd tests && npm test -- specs/$(PHASE)

test-e2e-watch: test-accounts
	cd tests && npm run test:watch

test-e2e-clean:
	rm -rf /tmp/qxp-pool-init-* /tmp/qxp-e2e-* tests/.pool-lock.json
