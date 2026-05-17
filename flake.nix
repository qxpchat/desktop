{
  description = "qxp — Chatmail desktop client";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    # Pinned `libs/deltachat-core-rust` submodule (see .gitmodules). A flake's
    # source tree never carries submodule contents, so the submodule is fetched
    # here as its own input — fixed-output and cached — instead of running
    # `git submodule update` mid-build, which needs network and fails in the
    # Nix sandbox.
    deltachat-core = {
      url = "git+https://codeberg.org/qxp/deltachat-core-rust.git?ref=qxp&submodules=1";
      flake = false;
    };
  };

  outputs =
    { self, nixpkgs, flake-utils, deltachat-core, ... }:
    # Linux only: the GUI links webkitgtk/gtk3/libayatana-appindicator, none of
    # which build on Darwin. `eachSystem` (not `eachDefaultSystem`) keeps the
    # flake from even evaluating those inputs on macOS — a clean "unsupported
    # system" instead of an eval failure.
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" ] (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        lib = pkgs.lib;

        # Single source of truth for the version: read it from Cargo.toml so the
        # flake can never drift from the four sites scripts/sync-versions.sh
        # keeps in lock-step.
        version = (builtins.fromTOML
          (builtins.readFile ./src-tauri/Cargo.toml)).package.version;

        # Compiled Svelte SPA. Built in its own pure derivation; npm deps are a
        # fixed-output fetch keyed by npmDepsHash.
        frontend = pkgs.buildNpmPackage {
          pname = "qxp-frontend";
          inherit version;
          src = ./frontend;

          # Pin of frontend/package-lock.json's npm dep closure. Re-run
          # `nix build` after any lockfile change and update to the printed
          # "got: sha256-…" hash.
          npmDepsHash = "sha256-WhPGam/wsnGUjE39WRE5UoHBWNl09izeuACKnPrp6zY=";

          installPhase = ''
            runHook preInstall
            cp -r dist $out
            runHook postInstall
          '';
        };
      in
      {
        packages.default = pkgs.rustPlatform.buildRustPackage {
          pname = "qxp-desktop";
          inherit version;
          src = ./.;

          # src-tauri/ has its own Cargo.toml + Cargo.lock (the repo root has
          # neither). Vendor and build from there; its path deps (`../server`,
          # `../libs/deltachat-core-rust/...`) resolve into the rest of `src`.
          cargoRoot = "src-tauri";
          buildAndTestSubdir = "src-tauri";
          cargoLock.lockFile = ./src-tauri/Cargo.lock;

          # Drop the two trees the build needs but `src` lacks: the submodule
          # (never part of a flake source) and the prebuilt frontend (Tauri's
          # build.rs reads frontendDist = ../frontend/dist).
          postPatch = ''
            rm -rf libs/deltachat-core-rust
            cp -r ${deltachat-core} libs/deltachat-core-rust
            chmod -R u+w libs/deltachat-core-rust
            cp -r ${frontend} frontend/dist
          '';

          nativeBuildInputs = with pkgs; [
            pkg-config
            perl
            cmake
            imagemagick
            wrapGAppsHook3
          ];

          buildInputs = with pkgs; [
            webkitgtk_4_1
            libsoup_3
            glib
            gtk3
            librsvg
            libayatana-appindicator
            openssl
          ];

          # Link the store's OpenSSL, never openssl-sys' vendored copy.
          OPENSSL_NO_VENDOR = 1;

          # No bundler is involved (plain `cargo build`), so install the
          # desktop entry and icons by hand — the set `cargo tauri build`
          # would have produced.
          postInstall = ''
            mkdir -p $out/share/icons/hicolor/scalable/apps
            cp assets/generated/icon.svg \
              $out/share/icons/hicolor/scalable/apps/chat.qxp.desktop.svg

            for size in 48 64 96 128 256; do
              dir=$out/share/icons/hicolor/''${size}x''${size}/apps
              mkdir -p "$dir"
              magick -background none -density 600 -resize "''${size}x''${size}" \
                assets/generated/icon.svg "$dir/chat.qxp.desktop.png"
            done

            mkdir -p $out/share/applications
            cp chat.qxp.desktop $out/share/applications/
          '';

          # WKWebView's DMABUF renderer is broken on many GPUs/VMs; disable it
          # for every launch. wrapGAppsHook does the wrapping — just add the arg.
          preFixup = ''
            gappsWrapperArgs+=( --set WEBKIT_DISABLE_DMABUF_RENDERER 1 )
          '';

          # The shell crate has no test suite wired up.
          doCheck = false;

          meta = {
            description = "Desktop client for the Chatmail / Delta Chat protocol";
            mainProgram = "qxp-desktop";
            license = lib.licenses.mpl20;
            platforms = lib.platforms.linux;
          };
        };

        apps.default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/qxp-desktop";
        };
      }
    );
}
