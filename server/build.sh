#!/bin/bash
# Render build script — installs language runtimes and Node dependencies
set -e

echo "[Build] Installing system language runtimes..."
apt-get update -qq 2>/dev/null || true
apt-get install -y --no-install-recommends \
  gfortran \
  nasm \
  lua5.4 \
  tclsh \
  gawk \
  sqlite3 \
  php-cli \
  r-base \
  2>/dev/null || echo "[Build] Some packages skipped (non-root or not available)"

echo "[Build] Verifying installed runtimes..."
for bin in gfortran nasm lua5.4 tclsh awk sqlite3 php Rscript; do
  if command -v "$bin" &>/dev/null; then
    echo "  [OK] $bin: $(${bin} --version 2>&1 | head -1)"
  else
    echo "  [SKIP] $bin: not available (will use cloud fallback)"
  fi
done

echo "[Build] Installing Node.js dependencies..."
npm install

echo "[Build] Done."
