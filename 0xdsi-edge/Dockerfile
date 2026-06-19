# ─── Build Stage ───────────────────────────────────────────────
FROM rust:1.78-bookworm AS builder

RUN apt-get update && apt-get install -y \
    cmake \
    clang \
    libclang-dev \
    librdkafka-dev \
    librocksdb-dev \
    libpcap-dev \
    libsnmp-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY Cargo.toml Cargo.lock* ./
COPY src/ src/

RUN cargo build --release && \
    strip target/release/0xdsi-edge

# ─── Runtime Stage ─────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    librdkafka1 \
    librocksdb7.8 \
    libpcap0.8 \
    libsnmp40 \
    tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -s /bin/false -d /var/lib/0xdsi-edge oxdsi \
    && mkdir -p /var/lib/0xdsi-edge/buffer /etc/0xdsi-edge \
    && chown -R oxdsi:oxdsi /var/lib/0xdsi-edge

COPY --from=builder /build/target/release/0xdsi-edge /usr/local/bin/
COPY config/config.toml /etc/0xdsi-edge/config.toml

USER oxdsi

EXPOSE 9443/tcp
EXPOSE 514/tcp 514/udp
EXPOSE 6514/tcp
EXPOSE 8088/tcp
EXPOSE 2055/udp
EXPOSE 162/udp

VOLUME ["/var/lib/0xdsi-edge/buffer"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/usr/local/bin/0xdsi-edge", "--validate-config"]

ENTRYPOINT ["tini", "--"]
CMD ["/usr/local/bin/0xdsi-edge", "--config", "/etc/0xdsi-edge/config.toml"]

LABEL org.opencontainers.image.title="0xDSI Edge Collector" \
      org.opencontainers.image.description="High-performance edge security telemetry collector" \
      org.opencontainers.image.vendor="0xDSI" \
      org.opencontainers.image.version="0.1.0"
