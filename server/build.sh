#!/bin/bash
# Render runtime installer — installs language runtimes needed for local code execution.
# Called via npm preinstall hook so it runs on every Render deploy automatically.

echo "[Build] Installing system language runtimes..."

# Try apt-get (Render/Ubuntu build environment has root during build)
if command -v apt-get &>/dev/null; then
  apt-get update -qq 2>/dev/null || true
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    gfortran \
    nasm \
    lua5.4 \
    tclsh \
    gawk \
    sqlite3 \
    php-cli \
    r-base \
    2>/dev/null || echo "[Build] Some packages skipped"
else
  echo "[Build] apt-get not available — skipping system package install"
fi

echo "[Build] Runtime check:"
for bin in gfortran nasm lua5.4 tclsh awk sqlite3 php Rscript; do
  if command -v "$bin" &>/dev/null; then
    echo "  [OK]   $bin"
  else
    echo "  [MISS] $bin (cloud fallback will be used)"
  fi
done

echo "[Build] Done."
