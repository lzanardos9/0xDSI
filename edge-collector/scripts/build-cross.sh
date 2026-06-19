#!/usr/bin/env bash
set -euo pipefail

# 0xDSI Edge Collector - Cross-compilation Build Script
# Builds static binaries for: x86_64, aarch64, armv7

VERSION="${VERSION:-$(grep '^version' Cargo.toml | head -1 | cut -d'"' -f2)}"
TARGETS=(
    "x86_64-unknown-linux-musl"
    "aarch64-unknown-linux-musl"
    "armv7-unknown-linux-musleabihf"
)

echo "Building 0xDSI Edge Collector v${VERSION}"
echo "========================================="

for target in "${TARGETS[@]}"; do
    echo ""
    echo "[*] Building for ${target}..."

    rustup target add "${target}" 2>/dev/null || true

    RUSTFLAGS="-C target-feature=+crt-static -C link-arg=-s" \
        cargo build --release --target "${target}" --bin 0xdsi-edge

    OUT_DIR="dist/${target}"
    mkdir -p "${OUT_DIR}"
    cp "target/${target}/release/0xdsi-edge" "${OUT_DIR}/"

    BINARY_SIZE=$(du -h "${OUT_DIR}/0xdsi-edge" | cut -f1)
    echo "    -> ${OUT_DIR}/0xdsi-edge (${BINARY_SIZE})"
done

echo ""
echo "Build complete. Artifacts in dist/"
echo ""
ls -la dist/*/0xdsi-edge

# Create checksums
echo ""
echo "Generating SHA256 checksums..."
cd dist
for target in "${TARGETS[@]}"; do
    sha256sum "${target}/0xdsi-edge" >> "checksums-${VERSION}.sha256"
done
cat "checksums-${VERSION}.sha256"
