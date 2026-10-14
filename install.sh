#!/usr/bin/env bash
# Easy INSTALL / UPDATE for the opencode-browser-agent plugin (Linux/macOS).
#
#   First install (or after editing the source):
#       bash install.sh
#   Update (git pull -> rebuild -> redeploy):
#       bash install.sh --update        (or: bash update.sh)
#
# Steps: git pull (with --update) -> npm install if needed -> esbuild+tsc build
#        -> sanity check -> copy dist to installed plugin locations ->
#        point ~/.config/opencode/opencode.json at the local dist (file:// URL)
#        -> strip BOM from ~/.agent-browser/config.json
# Then restart opencode (plugins load at startup).
#
# Touches only your home directory; never touches running browsers.

set -euo pipefail

UPDATE=0
for a in "$@"; do
  case "$a" in
    -u|--update) UPDATE=1 ;;
    -h|--help)
      sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $a (use --update)" >&2; exit 2 ;;
  esac
done

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$REPO/dist"
step() { printf '\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    OK  \033[32m%s\033[0m\n' "$1"; }
warn() { printf '    !!  \033[33m%s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- 1. update
if [ "$UPDATE" = "1" ]; then
  step "git pull (update)"
  if git -C "$REPO" pull --ff-only; then ok "repository updated"
  else warn "git pull failed (dirty tree or offline) - continuing with local files"; fi
fi

# ------------------------------------------------------------ 2. node deps
step "dependencies"
if [ ! -d "$REPO/node_modules/@opencode-ai/plugin" ]; then
  warn "node_modules missing -> npm install"
  (cd "$REPO" && npm install --no-fund --no-audit)
fi
ok "node_modules present"

# ----------------------------------------------------------------- 3. build
step "build"
mkdir -p "$DIST"
(
  cd "$REPO"
  npx --yes esbuild@0.25.0 "$REPO/index.ts" --bundle --platform=node --format=esm \
    --target=esnext --outfile="$DIST/index.js"
  if [ -x "$REPO/node_modules/.bin/tsc" ]; then
    if "$REPO/node_modules/.bin/tsc"; then ok "dist/index.d.ts generated"
    else warn "tsc (declarations) failed - .d.ts may be stale"; fi
  else
    warn "tsc not installed - skipped declarations"
  fi
)
[ -f "$DIST/index.js" ] || { echo "build produced no dist/index.js" >&2; exit 1; }
ok "dist/index.js bundled"

# ---------------------------------------------------------- 4. sanity check
step "sanity check"
# Unsafe only if a rendered line STARTS with the kill command (i.e. it is
# presented as something to run). Sentences like 'NEVER run pkill ...' are fine.
if grep -qE '(^|\\n)[^A-Za-z0-9]*pkill' "$DIST/index.js"; then
  echo "bundle presents pkill as a command - aborting deploy" >&2; exit 1
fi
grep -q 'auto-connect' "$DIST/index.js" || { echo "bundle missing auto-connect policy" >&2; exit 1; }
grep -q 'skills get core' "$DIST/index.js" || { echo "bundle missing 'skills get core' reference" >&2; exit 1; }
ok "bundle $(du -k "$DIST/index.js" | cut -f1) KB, policy clean"

# --------------------------------------------------------------- 5. deploy
step "deploy to installed plugin copies"
selfdir="$HOME/.config/opencode/node_modules/opencode-browser-agent"
[ -d "$(dirname "$selfdir")" ] && mkdir -p "$selfdir"
for t in \
"$HOME/.config/opencode/node_modules/opencode-browser-agent/dist" \
"$HOME/.config/opencode/node_modules/opencode-agent-browser/dist" \
"$HOME/.cache/opencode/packages/opencode-agent-browser/node_modules/opencode-agent-browser/dist" \
"$HOME/.cache/opencode/packages/opencode-agent-browser@latest/node_modules/opencode-agent-browser/dist"
do
  parent="$(dirname "$(dirname "$t")")"
  if [ -d "$parent" ]; then
    mkdir -p "$t"
    cp -f "$DIST/index.js" "$t/"
    [ -f "$DIST/index.d.ts" ] && cp -f "$DIST/index.d.ts" "$t/"
    ok "$t"
  else
    warn "not found, skipped: $t"
  fi
done

# make the self-named copy resolvable as a bare package name too
selfdir="$HOME/.config/opencode/node_modules/opencode-browser-agent"
if [ -d "$selfdir" ]; then
  node -e '
    const fs = require("fs");
    const [d, repo] = process.argv.slice(1);
    const v = JSON.parse(fs.readFileSync(repo + "/package.json", "utf8")).version;
    const manifest = { name: "opencode-browser-agent", version: v, type: "module",
      main: "dist/index.js", exports: { ".": { import: "./dist/index.js" } } };
    fs.writeFileSync(d + "/package.json", JSON.stringify(manifest, null, 2) + "\n");
    console.log("    OK  manifest for bare-name resolution");
  ' "$selfdir" "$REPO"
fi

# -------------------------------------------------- 6. point opencode at it
step "global opencode.json"
CFG="$HOME/.config/opencode/opencode.json"
if [ -f "$CFG" ]; then
  node -e '
    const fs = require("fs"), { pathToFileURL } = require("url");
    const [cfgPath, distPath] = process.argv.slice(1);
    let raw = fs.readFileSync(cfgPath, "utf8");
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const cfg = JSON.parse(raw);
    cfg.plugin = [pathToFileURL(distPath).href];
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
    console.log("    OK  plugin -> " + cfg.plugin[0]);
  ' "$CFG" "$DIST/index.js"
else
  warn "$CFG not found - add the plugin entry manually"
fi

# ------------------------------------------------------- 7. strip BOM noise
step "agent-browser config.json"
ABC="$HOME/.agent-browser/config.json"
if [ -f "$ABC" ]; then
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const b = fs.readFileSync(p);
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) {
      fs.writeFileSync(p, b.subarray(3));
      console.log("    OK  BOM removed");
    } else {
      console.log("    OK  no BOM present");
    }
  ' "$ABC"
else
  warn "$ABC not found - skipped"
fi

# -------------------------------------------------------------- 8. summary
echo
echo "Done. Restart opencode so the plugin reloads."
echo "  install:  bash install.sh"
echo "  update:   bash update.sh        (or: bash install.sh --update)"
