#!/usr/bin/env bash
# Installs or updates Screen Remote on a Raspberry Pi (64-bit Raspberry Pi OS Bookworm or newer).
#
#   cd ~/screen-remote
#   sudo bash scripts/install-pi.sh
#
# Safe to run again after updating the code: the setup PIN, certificates and saved state are kept.
#
# Options (environment variables):
#   SR_HOSTNAME=screenremote   mDNS name, gives https://screenremote.local
#   SR_FIREWALL=1            set to 0 to leave the firewall alone
#   SR_PIN=123456            set the setup PIN without prompting (only used if none is set)
#   SR_ETH=eth0              wired interface that faces the processor network
#   SR_STATIC_IPS="192.168.0.250/24 192.168.1.250/24"
#                            fixed addresses the Pi always has on that interface, on top of DHCP,
#                            so it can reach processors on networks without DHCP. "" to skip.
set -euo pipefail

HOSTNAME_NEW="${SR_HOSTNAME:-screenremote}"
FIREWALL="${SR_FIREWALL:-1}"
ETH="${SR_ETH:-eth0}"
STATIC_IPS="${SR_STATIC_IPS-192.168.0.250/24 192.168.1.250/24}"
NM_PROFILE=screen-remote-wired
APP_DIR=/opt/screen-remote
DATA_DIR=/var/lib/screen-remote
CONF_DIR=/etc/screen-remote
CERT_DIR="$CONF_DIR/certs"
CA_DIR="$CONF_DIR/ca"
SERVICE_USER=screenremote
NODE_MAJOR_MIN=20
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_USER="${SUDO_USER:-root}"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

step "Installing system packages"
apt-get update -qq
apt-get install -y -qq avahi-daemon libnss-mdns mkcert libnss3-tools rsync curl ca-certificates

node_ok() {
  command -v node >/dev/null && command -v npm >/dev/null &&
    (( $(node -p 'process.versions.node.split(".")[0]') >= NODE_MAJOR_MIN ))
}
if ! node_ok; then
  step "Installing Node.js"
  # Newer Raspberry Pi OS ships a recent enough Node; older releases need NodeSource.
  apt-get install -y -qq nodejs npm >/dev/null 2>&1 || true
  if ! node_ok; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y -qq nodejs
  fi
fi
node_ok || { echo "Node.js ${NODE_MAJOR_MIN}+ could not be installed" >&2; exit 1; }
echo "Node $(node -v)"

static_addrs=()
if [[ -n "$STATIC_IPS" ]]; then
  step "Fixed addresses on ${ETH}: ${STATIC_IPS} (plus DHCP when the network has it)"
  if ! command -v nmcli >/dev/null; then
    warn "NetworkManager not found; skipping. Give the Pi an address on the processor network yourself."
  elif ! ip link show "$ETH" >/dev/null 2>&1; then
    warn "No interface called ${ETH}; skipping. Set SR_ETH to the wired interface name."
  else
    addrs="${STATIC_IPS// /,}"
    if ! nmcli -t -f NAME con show | grep -qx "$NM_PROFILE"; then
      nmcli con add type ethernet ifname "$ETH" con-name "$NM_PROFILE" >/dev/null
    fi
    # DHCP is tried forever in the background; the fixed addresses and IPv6 link-local keep the
    # connection up when there is no DHCP server, as on most processor networks.
    nmcli con mod "$NM_PROFILE" \
      connection.autoconnect yes connection.autoconnect-priority 50 \
      ipv4.method auto ipv4.addresses "$addrs" ipv4.may-fail yes ipv4.dhcp-timeout 2147483647 \
      ipv6.method link-local
    for a in $STATIC_IPS; do static_addrs+=("${a%%/*}"); done
    echo "Applied on next reboot (or: sudo nmcli con up ${NM_PROFILE})."
  fi
fi

step "Setting hostname to ${HOSTNAME_NEW} (https://${HOSTNAME_NEW}.local)"
if [[ "$(hostname)" != "$HOSTNAME_NEW" ]]; then
  hostnamectl set-hostname "$HOSTNAME_NEW"
  if grep -q '^127\.0\.1\.1' /etc/hosts; then
    sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t${HOSTNAME_NEW}/" /etc/hosts
  else
    printf '127.0.1.1\t%s\n' "$HOSTNAME_NEW" >>/etc/hosts
  fi
fi
systemctl enable --now avahi-daemon >/dev/null
systemctl restart avahi-daemon

step "Building (as ${BUILD_USER})"
sudo -u "$BUILD_USER" -H bash -c "cd '$SRC_DIR' && npm ci --no-audit --no-fund && npm run build"

step "Installing to ${APP_DIR}"
id "$SERVICE_USER" >/dev/null 2>&1 ||
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$APP_DIR" "$DATA_DIR" "$CERT_DIR" "$CA_DIR"
rsync -a --delete \
  --exclude /.git --exclude node_modules --exclude /server/data --exclude /server/data-dev \
  --exclude /web/.svelte-kit \
  "$SRC_DIR/" "$APP_DIR/"
(cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund --ignore-scripts)
chown -R root:root "$APP_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR"

step "HTTPS certificate"
ips="$( (hostname -I | tr ' ' '\n'; printf '%s\n' "${static_addrs[@]}") | grep -E '^[0-9]+\.' | sort -u | tr '\n' ' ' || true)"
want="${HOSTNAME_NEW}.local ${HOSTNAME_NEW} localhost 127.0.0.1 ${ips% }"
if [[ ! -f "$CERT_DIR/hosts" || "$(cat "$CERT_DIR/hosts")" != "$want" || ! -f "$CERT_DIR/cert.pem" ]]; then
  # shellcheck disable=SC2086
  CAROOT="$CA_DIR" mkcert -cert-file "$CERT_DIR/cert.pem" -key-file "$CERT_DIR/key.pem" $want
  echo "$want" >"$CERT_DIR/hosts"
fi
cp "$CA_DIR/rootCA.pem" "$CERT_DIR/rootCA.pem"
chmod 700 "$CA_DIR"
chmod 600 "$CA_DIR/rootCA-key.pem"
chown root:"$SERVICE_USER" "$CERT_DIR"/*.pem
chmod 640 "$CERT_DIR/key.pem"
chmod 644 "$CERT_DIR/cert.pem" "$CERT_DIR/rootCA.pem"
echo "Certificate covers: $want"

step "Setup PIN"
pin_set() { [[ -f "$DATA_DIR/state.json" ]] && node -e "process.exit(require('$DATA_DIR/state.json').pin ? 0 : 1)"; }
if pin_set; then
  echo "A setup PIN is already set. Change it in the app (Settings)."
else
  # The running server saves its in-memory state on shutdown, which would undo the new PIN.
  systemctl stop screen-remote 2>/dev/null || true
  until sudo -u "$SERVICE_USER" DATA_DIR="$DATA_DIR" node "$APP_DIR/server/dist/cli/set-pin.js" ${SR_PIN:-}; do
    [[ -n "${SR_PIN:-}" ]] && exit 1
    echo "Try again."
  done
fi

step "systemd service"
cat >/etc/systemd/system/screen-remote.service <<EOF
[Unit]
Description=Screen Remote (Brompton processor monitor)
After=network-online.target avahi-daemon.service
Wants=network-online.target
# Never give up restarting, however many times it fails in a row.
StartLimitIntervalSec=0

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v node) ${APP_DIR}/server/dist/index.js
Environment=NODE_ENV=production
Environment=DATA_DIR=${DATA_DIR}
Environment=TLS_CERT=${CERT_DIR}/cert.pem
Environment=TLS_KEY=${CERT_DIR}/key.pem
Environment=CA_CERT=${CERT_DIR}/rootCA.pem
Restart=always
RestartSec=3
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
ReadWritePaths=${DATA_DIR}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable screen-remote >/dev/null
systemctl restart screen-remote

if [[ "$FIREWALL" == "1" ]]; then
  step "Firewall (SSH, HTTP, HTTPS, mDNS only)"
  apt-get install -y -qq ufw
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 5353/udp >/dev/null
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw --force enable >/dev/null
  ufw status
fi

step "Start on power-up"
boot_units=(screen-remote avahi-daemon)
command -v nmcli >/dev/null && boot_units+=(NetworkManager)
[[ "$FIREWALL" == "1" ]] && boot_units+=(ufw)
for unit in "${boot_units[@]}"; do
  systemctl enable "$unit" >/dev/null 2>&1 || true
  if systemctl is-enabled --quiet "$unit"; then
    echo "  ${unit}: starts at boot"
  else
    warn "${unit} is not set to start at boot"
  fi
done

healthy=0
for _ in $(seq 1 15); do
  if curl -fsk --max-time 2 https://127.0.0.1/healthz >/dev/null; then healthy=1; break; fi
  sleep 1
done
if [[ "$healthy" == "1" ]]; then
  step "Done"
  echo "Screen Remote is running. From now on it starts by itself whenever the Pi is powered on."
  echo "Addresses now:  $(hostname -I)"
  [[ ${#static_addrs[@]} -gt 0 ]] && echo "After reboot also: ${static_addrs[*]}"
  echo
  echo "Next:"
  echo "  1. sudo reboot   (applies the hostname and fixed addresses)"
  echo "  2. On a phone on the show Wi-Fi: http://${HOSTNAME_NEW}.local/certs  (once per phone)"
  echo "  3. Then open https://${HOSTNAME_NEW}.local"
  echo "Logs: journalctl -u screen-remote -f"
else
  warn "Screen Remote did not come up. Check: journalctl -u screen-remote -n 50"
  exit 1
fi
