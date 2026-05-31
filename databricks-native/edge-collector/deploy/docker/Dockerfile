# ─── Build Stage ───
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG VERSION=dev
ARG GIT_COMMIT=unknown

RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X main.version=${VERSION} -X main.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ) -X main.gitCommit=${GIT_COMMIT}\" \
    -o /bin/0xdsi-collector \
    ./cmd/collector

# ─── Runtime Stage ───
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata tini && \
    adduser -D -H -u 1000 collector

COPY --from=builder /bin/0xdsi-collector /usr/local/bin/0xdsi-collector
COPY dna/ /etc/0xdsi/dna/

USER collector
WORKDIR /tmp

VOLUME ["/tmp/0xdsi-buffer"]

ENTRYPOINT ["tini", "--"]
CMD ["0xdsi-collector"]

LABEL org.opencontainers.image.title="0xDSI Edge Collector\" \
      org.opencontainers.image.description="Universal security event collector with Connector DNA\" \
      org.opencontainers.image.vendor="0xDSI\" \
      org.opencontainers.image.source="https://github.com/0xdsi/edge-collector"

EXPOSE 514/udp 514/tcp 1514/udp 1514/tcp 8088/tcp
