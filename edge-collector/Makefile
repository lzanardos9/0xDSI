.PHONY: build release test clean docker docker-push cross lint fmt

# Default target
build:
	cargo build

release:
	RUSTFLAGS="-C target-feature=+crt-static -C link-arg=-s\" cargo build --release

test:
	cargo test --workspace

lint:
	cargo clippy --workspace -- -D warnings

fmt:
	cargo fmt --all

clean:
	cargo clean
	rm -rf dist/

# Docker targets
docker:
	docker build -t ghcr.io/0xdsi/edge-collector:dev .

docker-push:
	bash scripts/docker-push.sh

# Cross-compilation
cross:
	bash scripts/build-cross.sh

# Run locally
run:
	cargo run --bin 0xdsi-edge -- --config config/edge.toml --log-level debug

# List all supported connectors
list-connectors:
	cargo run --bin 0xdsi-edge -- --list-connectors

# Generate config template
config-template:
	@cat config/edge.toml
