#!/bin/zsh
# Installs the other tools at the versions the published results used, into bench/tools only.
set -euo pipefail
cd "${0:A:h}"
mkdir -p tools
cd tools
[[ -f package.json ]] || echo '{"private":true}' > package.json
npm install --silent --no-audit --no-fund chrome-devtools-mcp@1.12.0 @playwright/mcp@0.0.84 @playwright/cli@0.1.23 agent-browser@0.41.2
UV_TOOL_DIR="$PWD/uv-tools" UV_TOOL_BIN_DIR="$PWD/uv-bin" uv tool install --quiet --python 3.12 --force browser-harness
"$PWD/uv-bin/browser-harness" --version 2>/dev/null | head -1 || true
ls node_modules/.bin | grep -E '^(chrome-devtools-mcp|playwright-mcp|playwright-cli|agent-browser)$'
