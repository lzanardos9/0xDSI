# ============================================================================
# 0xDSI Edge Collector - Multi-stage Docker Build
# Single binary, statically linked (musl), multi-arch support
# ============================================================================

# Stage 1: Build with musl for static linking
FROM rust:1.79-alpine AS builder

RUN apk add --no-cache \
    musl-dev \
    pkgconfig \
    openssl-dev \
    openssl-libs-static \
    cmake \
    make \
    g++ \
    linux-headers \
    clang \
    lld \
    protobuf-dev

WORKDIR /build

# Cache dependencies first
COPY Cargo.toml Cargo.lock* ./
COPY crates/core/Cargo.toml crates/core/Cargo.toml
COPY crates/transport/Cargo.toml crates/transport/Cargo.toml
COPY crates/ocsf/Cargo.toml crates/ocsf/Cargo.toml
COPY crates/parsers/Cargo.toml crates/parsers/Cargo.toml
COPY crates/plugins/Cargo.toml crates/plugins/Cargo.toml
COPY crates/edge-agent/Cargo.toml crates/edge-agent/Cargo.toml
COPY crates/connectors/siem/Cargo.toml crates/connectors/siem/Cargo.toml
COPY crates/connectors/cloud-aws/Cargo.toml crates/connectors/cloud-aws/Cargo.toml
COPY crates/connectors/cloud-azure/Cargo.toml crates/connectors/cloud-azure/Cargo.toml
COPY crates/connectors/cloud-gcp/Cargo.toml crates/connectors/cloud-gcp/Cargo.toml
COPY crates/connectors/edr/Cargo.toml crates/connectors/edr/Cargo.toml
COPY crates/connectors/firewall/Cargo.toml crates/connectors/firewall/Cargo.toml
COPY crates/connectors/iam/Cargo.toml crates/connectors/iam/Cargo.toml
COPY crates/connectors/email-security/Cargo.toml crates/connectors/email-security/Cargo.toml
COPY crates/connectors/vuln/Cargo.toml crates/connectors/vuln/Cargo.toml
COPY crates/connectors/threat-intel/Cargo.toml crates/connectors/threat-intel/Cargo.toml
COPY crates/connectors/waf/Cargo.toml crates/connectors/waf/Cargo.toml
COPY crates/connectors/dlp/Cargo.toml crates/connectors/dlp/Cargo.toml
COPY crates/connectors/container/Cargo.toml crates/connectors/container/Cargo.toml
COPY crates/connectors/devsecops/Cargo.toml crates/connectors/devsecops/Cargo.toml
COPY crates/connectors/ndr/Cargo.toml crates/connectors/ndr/Cargo.toml
COPY crates/connectors/casb/Cargo.toml crates/connectors/casb/Cargo.toml
COPY crates/connectors/soar/Cargo.toml crates/connectors/soar/Cargo.toml
COPY crates/connectors/observability/Cargo.toml crates/connectors/observability/Cargo.toml
COPY crates/connectors/ics-ot/Cargo.toml crates/connectors/ics-ot/Cargo.toml
COPY crates/connectors/plc-ot-protocols/Cargo.toml crates/connectors/plc-ot-protocols/Cargo.toml
COPY crates/connectors/dns-security/Cargo.toml crates/connectors/dns-security/Cargo.toml
COPY crates/connectors/endpoint-mgmt/Cargo.toml crates/connectors/endpoint-mgmt/Cargo.toml
COPY crates/connectors/grc/Cargo.toml crates/connectors/grc/Cargo.toml
COPY crates/connectors/collaboration/Cargo.toml crates/connectors/collaboration/Cargo.toml
COPY crates/connectors/database-security/Cargo.toml crates/connectors/database-security/Cargo.toml
COPY crates/connectors/zero-trust/Cargo.toml crates/connectors/zero-trust/Cargo.toml

# Copy full source
COPY crates/ crates/

# Build release binary with static musl linking
ENV RUSTFLAGS="-C target-feature=+crt-static -C link-arg=-s"
RUN cargo build --release --bin 0xdsi-edge

# Stage 2: Minimal runtime (distroless-equivalent)
FROM alpine:3.20 AS runtime

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S oxdsi && \
    adduser -S -G oxdsi oxdsi && \
    mkdir -p /etc/0xdsi /var/lib/0xdsi/buffer /var/log/0xdsi && \
    chown -R oxdsi:oxdsi /etc/0xdsi /var/lib/0xdsi /var/log/0xdsi

COPY --from=builder /build/target/release/0xdsi-edge /usr/local/bin/0xdsi-edge
COPY config/edge.toml /etc/0xdsi/edge.toml

USER oxdsi
WORKDIR /var/lib/0xdsi

EXPOSE 9090 9091 4317

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD /usr/local/bin/0xdsi-edge --validate-config || exit 1

ENTRYPOINT ["/usr/local/bin/0xdsi-edge"]
CMD ["--config", "/etc/0xdsi/edge.toml"]
