.PHONY: help icons

help:
	@echo "qxp — top-level make targets"
	@echo
	@echo "  make icons    Regenerate visual assets from assets/logo.svg."
	@echo "                Always writes the 4 gitignored text derivatives (pure Python)."
	@echo "                Also rasterises the 2 committed PNGs if imagemagick is reachable"
	@echo "                (via nix-shell or directly). See assets/scripts/generate-logo.py."

icons:
	@assets/scripts/generate-logo.py
