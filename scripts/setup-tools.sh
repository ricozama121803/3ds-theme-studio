#!/usr/bin/env bash
# Build kame-tools and rstmcpp from source into ./bin (needs git, make, a C/C++ compiler).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
git clone --recurse-submodules https://gitlab.com/beelzy/kame-tools.git
git clone --recurse-submodules https://gitlab.com/beelzy/rstmcpp.git

make -C kame-tools
make -C rstmcpp

mkdir -p "$ROOT/bin"
cp kame-tools/output/linux-*/kame-tools "$ROOT/bin/"
cp rstmcpp/rstmcpp "$ROOT/bin/"
echo "Installed tools into $ROOT/bin"
