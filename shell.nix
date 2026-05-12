# Top-level dev shell. Provides the tools needed to run repo-root `make`
# targets — currently just `make icons`. Each platform keeps its own shell:
#
#   nix-shell                 # this file: make + asset-pipeline deps
#   nix-shell desktop/        # full desktop Tauri shell (rustc, webkit, …)
#
# Usage:
#   nix-shell
#   make icons                # rerender all assets from assets/logo.svg

{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  name = "qxp";

  packages = with pkgs; [
    gnumake

    # Asset pipeline (assets/scripts/*). The scripts also self-provision
    # via their own nix-shell shebangs, but providing them here means the
    # user can also run the scripts directly inside this shell.
    python3
    imagemagick
    file

    git
  ];

  shellHook = ''
    # The asset scripts' own nix-shell shebangs auto-pick up this file
    # (nix-shell searches upward for shell.nix), so the hook fires once
    # for the user-facing shell and again per nested invocation. Guard
    # the banner so it only prints on the outermost entry.
    if [ -z "$IN_QXP_SHELL" ]; then
      export IN_QXP_SHELL=1
      echo "qxp shell — try \`make icons\` to regenerate visual assets."
    fi
  '';
}
