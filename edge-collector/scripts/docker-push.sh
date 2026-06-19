#!/usr/bin/env bash
set -euo pipefail

# 0xDSI Edge Collector - Multi-arch Docker Build & Push
# Uses Docker Buildx for multi-platform images

REGISTRY="${REGISTRY:-ghcr.io/0xdsi}"
IMAGE_NAME="edge-collector"
VERSION="${VERSION:-$(grep '^version' Cargo.toml | head -1 | cut -d'"' -f2)}"
PLATFORMS="linux/amd64,linux/arm64"

echo "Building multi-arch Docker image"
echo "  Registry: ${REGISTRY}"
echo "  Image:    ${IMAGE_NAME}"
echo "  Version:  ${VERSION}"
echo "  Platforms: ${PLATFORMS}"
echo ""

# Create buildx builder if it doesn't exist
docker buildx create --name 0xdsi-builder --use 2>/dev/null || \
    docker buildx use 0xdsi-builder

# Build and push
docker buildx build \
    --platform "${PLATFORMS}" \
    --tag "${REGISTRY}/${IMAGE_NAME}:${VERSION}" \
    --tag "${REGISTRY}/${IMAGE_NAME}:latest" \
    --push \
    .

echo ""
echo "Pushed: ${REGISTRY}/${IMAGE_NAME}:${VERSION}"
echo "Pushed: ${REGISTRY}/${IMAGE_NAME}:latest"
