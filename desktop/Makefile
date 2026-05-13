.PHONY: help server ui tauri-dev tauri-build install build clean

help:
	@echo "qxp desktop app — local dev"
	@echo
	@echo "  make tauri-dev      Run the full Tauri app (daemon + Vite + native window)"
	@echo "  make tauri-build    Bundle a release build (single-binary desktop app)"
	@echo
	@echo "  make server         Run only the Rust daemon (server/)        [127.0.0.1:4041]"
	@echo "  make ui             Run only the Vite dev server              [0.0.0.0:4040]"
	@echo "  make install        npm install in frontend/"
	@echo "  make build          Production build of the frontend (dist/)"
	@echo "  make clean          Remove target/, node_modules/, dist/"

server:
	cd server && cargo run

ui:
	cd frontend && npm run dev -- --host

tauri-dev: frontend/node_modules
	cd src-tauri && cargo tauri dev

tauri-build: frontend/node_modules
	cd src-tauri && cargo tauri build

install: frontend/node_modules

# Treat node_modules as an order-dependent target so the npm install only
# runs on a fresh clone (or after a manual `rm -rf node_modules`). Avoids
# the "sh: vite: command not found" trap.
frontend/node_modules: frontend/package.json
	cd frontend && npm install
	@touch frontend/node_modules

build:
	cd frontend && npm run build

clean:
	rm -rf server/target src-tauri/target frontend/node_modules frontend/dist
