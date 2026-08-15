#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# web-browse-plugin installer for DeepSeek Harness
# ──────────────────────────────────────────────────────────────
# One command to install:
#   curl -fsSL https://raw.githubusercontent.com/vkviyu/web-browse-plugin/main/install.sh | bash
#
# Or locally:
#   git clone https://github.com/vkviyu/web-browse-plugin.git
#   cd web-browse-plugin && bash install.sh
# ──────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   web-browse-plugin for DeepSeek Harness  ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── 1. Detect environment ────────────────────────────────────

# Node.js
if ! command -v node &>/dev/null; then
  error "Node.js is required. Install from https://nodejs.org (>= 18)"
fi
NODE_VER=$(node -v)
info "Node.js $NODE_VER"

# pnpm (preferred) or npm
if command -v pnpm &>/dev/null; then
  PKG_MGR="pnpm"
elif command -v npm &>/dev/null; then
  PKG_MGR="npm"
else
  error "pnpm or npm is required"
fi
info "Package manager: $PKG_MGR"

# DSH profile
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="${DSH_HOME}/profiles/web"
if [ ! -d "$PROFILE_DIR" ]; then
  warn "DSH profile directory not found at $PROFILE_DIR"
  warn "If you're using a different DSH profile, adjust paths manually."
fi

# ── 2. Determine install directory ────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="${WEB_BROWSE_INSTALL_DIR:-$SCRIPT_DIR}"

info "Install directory: $INSTALL_DIR"

# ── 3. Install dependencies ───────────────────────────────────

cd "$INSTALL_DIR"

if [ ! -f "package.json" ]; then
  error "package.json not found in $INSTALL_DIR. Are you in the right directory?"
fi

info "Installing npm dependencies..."
$PKG_MGR install --prod 2>&1 | tail -3

# ── 4. Install Chromium ───────────────────────────────────────

info "Downloading Chromium (this may take a minute)..."
PLAYWRIGHT_BROWSERS_PATH="$INSTALL_DIR/.playwright-browsers" \
  npx playwright install chromium 2>&1 | tail -5

info "Chromium installed to $INSTALL_DIR/.playwright-browsers"

# ── 5. Test the installation ──────────────────────────────────

info "Testing browser..."
TEST_OUTPUT=$(node web-browse.mjs "https://httpbin.org/get?q=web-browse-test" --max-text 500 --no-links 2>&1) || true
if echo "$TEST_OUTPUT" | grep -q '"title"'; then
  info "Browser test passed!"
else
  warn "Browser test returned unexpected output:"
  echo "$TEST_OUTPUT" | head -5
  warn "The tool may still work — check the output above."
fi

# ── 6. Configure DSH ──────────────────────────────────────────

PATCH_FILE="${PROFILE_DIR}/cordis.patch.yml"

if [ -f "$PATCH_FILE" ]; then
  # Check if already configured
  if grep -q "web-browse" "$PATCH_FILE" 2>/dev/null; then
    info "DSH patch already configured."
  else
    info ""
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "  DSH configuration required"
    info ""
    info "  Add the tool to your DSH profile. Two ways:"
    info ""
    info "  A) Dynamic Plugin (temporary, per-session):"
    info "     Ask your agent to run:"
    info "     @web-browse-plugin/plugin.cordis.js"
    info ""
    info "  B) Static (survives restarts):"
    info "     Edit $PATCH_FILE"
    info "     (see TROUBLESHOOTING.md for the exact patch)"
    info ""
    info "  Or use via bash tool directly:"
    info "     node $INSTALL_DIR/web-browse.mjs <url>"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  fi
else
  warn "No DSH profile patch file found."
  warn "You can still use the tool via bash:"
  warn "  node $INSTALL_DIR/web-browse.mjs <url>"
fi

# ── 7. Done ───────────────────────────────────────────────────

echo ""
info "Installation complete!"
info ""
info "Quick test:"
info "  node $INSTALL_DIR/web-browse.mjs 'https://example.com'"
info ""
info "Search the web:"
info "  node $INSTALL_DIR/web-browse.mjs 'https://www.bing.com/search?q=hello'"
echo ""