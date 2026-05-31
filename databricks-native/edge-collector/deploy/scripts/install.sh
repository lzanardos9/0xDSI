#!/usr/bin/env bash
# ─── 0xDSI Edge Collector Installer ───
# Usage: curl -sL https://install.0xdsi.io | sh -s -- --token=TOKEN --dna=DNA_NAME
#
# Options:
#   --token=TOKEN         Registration token (required)
#   --dna=DNA_NAME        Connector DNA name (default: generic_syslog)
#   --control-plane=URL   Control plane URL (default: auto-detect from token)
#   --site=SITE           Site name for tagging
#   --version=VERSION     Specific version to install (default: latest)
#   --service             Install as systemd service
#   --uninstall           Remove installation
set -euo pipefail

INSTALL_DIR="/opt/0xdsi"
BIN_NAME="0xdsi-collector"
SERVICE_NAME="0xdsi-collector"
CONFIG_DIR="/etc/0xdsi"
BUFFER_DIR="/var/lib/0xdsi/buffer"
LOG_DIR="/var/log/0xdsi"
USER="0xdsi"
GROUP="0xdsi"

# Defaults
TOKEN=""
DNA="generic_syslog"
CONTROL_PLANE=""
SITE="default"
VERSION="latest"
INSTALL_SERVICE=false
UNINSTALL=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[0xDSI]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[0xDSI]${NC} $1"; }
log_error() { echo -e "${RED}[0xDSI]${NC} $1" >&2; }

# Parse arguments
for arg in "$@"; do
  case $arg in
    --token=*)    TOKEN="${arg#*=}" ;;
    --dna=*)      DNA="${arg#*=}" ;;
    --control-plane=*) CONTROL_PLANE="${arg#*=}" ;;
    --site=*)     SITE="${arg#*=}" ;;
    --version=*)  VERSION="${arg#*=}" ;;
    --service)    INSTALL_SERVICE=true ;;
    --uninstall)  UNINSTALL=true ;;
    *)            log_error "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ─── Uninstall ───
if [ "$UNINSTALL" = true ]; then
  log_info "Uninstalling 0xDSI Edge Collector..."
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  rm -rf "$INSTALL_DIR" "$CONFIG_DIR"
  userdel "$USER" 2>/dev/null || true
  groupdel "$GROUP" 2>/dev/null || true
  systemctl daemon-reload
  log_ok "Uninstalled successfully."
  exit 0
fi

# ─── Validation ───
if [ -z "$TOKEN" ]; then
  log_error "Missing required --token argument"
  echo "Usage: curl -sL https://install.0xdsi.io | sh -s -- --token=TOKEN --dna=DNA_NAME"
  exit 1
fi

# ─── Detect Platform ───
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case $ARCH in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  armv7l)       ARCH="armv7" ;;
  *)            log_error "Unsupported architecture: $ARCH"; exit 1 ;;
esac

log_info "Platform: ${OS}/${ARCH}"
log_info "DNA: ${DNA}"
log_info "Version: ${VERSION}"

# ─── Create user/group ───
if ! id "$USER" &>/dev/null; then
  log_info "Creating service user: $USER"
  groupadd -r "$GROUP" 2>/dev/null || true
  useradd -r -g "$GROUP" -d "$INSTALL_DIR" -s /sbin/nologin "$USER"
fi

# ─── Create directories ───
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR/dna" "$BUFFER_DIR" "$LOG_DIR"
chown -R "$USER:$GROUP" "$BUFFER_DIR" "$LOG_DIR"

# ─── Download binary ───
DOWNLOAD_URL="https://releases.0xdsi.io/edge-collector/${VERSION}/${BIN_NAME}-${OS}-${ARCH}"
log_info "Downloading from: $DOWNLOAD_URL"

if command -v curl &>/dev/null; then
  curl -fsSL "$DOWNLOAD_URL" -o "${INSTALL_DIR}/${BIN_NAME}"
elif command -v wget &>/dev/null; then
  wget -q "$DOWNLOAD_URL" -O "${INSTALL_DIR}/${BIN_NAME}"
else
  log_error "Neither curl nor wget found"
  exit 1
fi

chmod +x "${INSTALL_DIR}/${BIN_NAME}"

# ─── Verify binary ───
if ! "${INSTALL_DIR}/${BIN_NAME}" --version &>/dev/null; then
  log_error "Binary verification failed"
  exit 1
fi

INSTALLED_VERSION=$("${INSTALL_DIR}/${BIN_NAME}" --version 2>&1 | head -1)
log_ok "Installed: $INSTALLED_VERSION"

# ─── Write config ───
cat > "${CONFIG_DIR}/collector.env" <<EOF
TOKEN=${TOKEN}
DNA=${DNA}
CONTROL_PLANE_URL=${CONTROL_PLANE}
SITE=${SITE}
BUFFER_DIR=${BUFFER_DIR}
LOG_LEVEL=info
EOF

chmod 600 "${CONFIG_DIR}/collector.env"
chown "$USER:$GROUP" "${CONFIG_DIR}/collector.env"

# ─── Install systemd service ───
if [ "$INSTALL_SERVICE" = true ] || [ -d /etc/systemd/system ]; then
  log_info "Installing systemd service..."

  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=0xDSI Edge Collector (${DNA})
Documentation=https://docs.0xdsi.io/edge-collector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
Group=${GROUP}
EnvironmentFile=${CONFIG_DIR}/collector.env
ExecStart=${INSTALL_DIR}/${BIN_NAME} \\
  --dna-name=\${DNA} \\
  --token=\${TOKEN} \\
  --control-plane=\${CONTROL_PLANE_URL} \\
  --buffer-dir=\${BUFFER_DIR} \\
  --log-level=\${LOG_LEVEL}
Restart=on-failure
RestartSec=5
StartLimitBurst=5
StartLimitIntervalSec=60

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${BUFFER_DIR} ${LOG_DIR}
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

# Resource limits
LimitNOFILE=65536
MemoryMax=512M
CPUQuota=50%

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl start "$SERVICE_NAME"

  log_ok "Service started: systemctl status $SERVICE_NAME"
fi

# ─── Final output ───
echo ""
log_ok "═══════════════════════════════════════════════════════════"
log_ok "  0xDSI Edge Collector installed successfully!"
log_ok "═══════════════════════════════════════════════════════════"
echo ""
echo "  DNA:            $DNA"
echo "  Binary:         ${INSTALL_DIR}/${BIN_NAME}"
echo "  Config:         ${CONFIG_DIR}/collector.env"
echo "  Buffer:         ${BUFFER_DIR}"
echo "  Service:        systemctl status $SERVICE_NAME"
echo ""
echo "  Commands:"
echo "    View logs:    journalctl -u $SERVICE_NAME -f"
echo "    Restart:      systemctl restart $SERVICE_NAME"
echo "    Stop:         systemctl stop $SERVICE_NAME"
echo "    Uninstall:    curl -sL https://install.0xdsi.io | sh -s -- --uninstall"
echo ""
