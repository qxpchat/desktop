.PHONY: help server ui tauri-dev tauri-build install build clean

help:
	@echo "qxp desktop app — local dev"
	@echo
	@echo "  make tauri-dev      Run the full Tauri app (daemon + Vite + native window)"
	@echo "  make tauri-build    Bundle a release build (single-binary desktop app)"
	@echo
	@echo "  make server         Run only the Rust daemon (server/)        [127.0.0.1:9090]"
	@echo "  make ui             Run only the Vite dev server              [0.0.0.0:8080]"
	@echo "  make install        npm install in frontend/"
	@echo "  make build          Production build of the frontend (dist/)"
	@echo "  make clean          Remove target/, node_modules/, dist/"

server:
	cd server && cargo run

ui:
	cd frontend && npm run dev -- --host

tauri-dev:
	cd src-tauri && cargo tauri dev

tauri-build:
	cd src-tauri && cargo tauri build

install:
	cd frontend && npm install

build:
	cd frontend && npm run build

clean:
	rm -rf server/target src-tauri/target frontend/node_modules frontend/dist
