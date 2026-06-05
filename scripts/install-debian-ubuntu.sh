#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-littleprince-agent}"
APP_USER="${APP_USER:-littleprince}"
APP_DIR="${APP_DIR:-/opt/littleprince-agent}"
DATA_DIR="${DATA_DIR:-/var/lib/littleprince-agent}"
ENV_FILE="${ENV_FILE:-/etc/littleprince-agent.env}"
SERVICE_NAME="${SERVICE_NAME:-littleprince-agent}"
REPO_URL="${REPO_URL:-https://github.com/359073395/LittlePrinceAgent.git}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR="${NODE_MAJOR:-20}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3721}"
API_TOKEN="${API_TOKEN:-}"
SECURE_COOKIE="${SECURE_COOKIE:-false}"
PUBLIC_URL="${PUBLIC_URL:-}"

log() { printf '\033[1;34m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

require_debian_or_ubuntu() {
  [[ -r /etc/os-release ]] || die "Cannot detect Linux distribution."
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    debian|ubuntu) ;;
    *) die "This installer supports Debian and Ubuntu only. Detected: ${PRETTY_NAME:-unknown}" ;;
  esac
}

as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required when not running as root."
    sudo "$@"
  fi
}

as_user() {
  if [[ "${EUID}" -eq 0 ]]; then
    runuser -u "${APP_USER}" -- "$@"
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required when not running as root."
    sudo -u "${APP_USER}" "$@"
  fi
}

need_node_install() {
  if ! command -v node >/dev/null 2>&1; then
    return 0
  fi
  local major
  major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  [[ "${major}" -lt 18 ]]
}

install_packages() {
  log "Installing Debian/Ubuntu packages..."
  as_root apt-get update
  as_root apt-get install -y ca-certificates curl gnupg git build-essential python3 make g++ pkg-config openssl

  if need_node_install; then
    log "Installing Node.js ${NODE_MAJOR}.x from NodeSource..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | as_root bash -
    as_root apt-get install -y nodejs
  else
    log "Node.js already installed: $(node --version)"
  fi
}

ensure_user_and_dirs() {
  if ! id -u "${APP_USER}" >/dev/null 2>&1; then
    log "Creating system user ${APP_USER}..."
    as_root useradd --system --create-home --home-dir "${DATA_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
  fi

  as_root mkdir -p "${APP_DIR}" "${DATA_DIR}"
  as_root chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}" "${DATA_DIR}"
}

checkout_repo() {
  log "Installing source from ${REPO_URL} (${BRANCH})..."
  if [[ -d "${APP_DIR}/.git" ]]; then
    as_user git -C "${APP_DIR}" fetch --prune origin
    as_user git -C "${APP_DIR}" checkout "${BRANCH}"
    as_user git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
  else
    as_root rm -rf "${APP_DIR:?}/"*
    as_user git clone --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${APP_DIR}"
  fi
}

install_node_deps() {
  log "Installing Node.js dependencies..."
  as_user env HOME="${DATA_DIR}" npm --prefix "${APP_DIR}" ci

  # electron-builder's postinstall rebuilds native addons for Electron. The web
  # service runs under Node.js, so rebuild better-sqlite3 once for the Node ABI.
  as_user env HOME="${DATA_DIR}" npm --prefix "${APP_DIR}" rebuild better-sqlite3
}

existing_env_value() {
  local key="$1"
  [[ -r "${ENV_FILE}" ]] || return 1
  grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 | cut -d= -f2- || return 1
}

write_env_file() {
  local token="${API_TOKEN}"
  if [[ -z "${token}" ]]; then
    token="$(existing_env_value LITTLE_PRINCE_AGENT_API_TOKEN || true)"
  fi
  if [[ -z "${token}" ]]; then
    token="$(openssl rand -hex 32)"
  fi
  local repo_public_url="${REPO_URL%.git}"

  log "Writing ${ENV_FILE}..."
  local tmp
  tmp="$(mktemp)"
  cat > "${tmp}" <<EOF_ENV
LITTLE_PRINCE_AGENT_MODE=cloud
LITTLE_PRINCE_AGENT_HOST=${HOST}
LITTLE_PRINCE_AGENT_PORT=${PORT}
LITTLE_PRINCE_AGENT_API_TOKEN=${token}
LITTLE_PRINCE_AGENT_USER_DIR=${DATA_DIR}
LITTLE_PRINCE_AGENT_SECURE_COOKIE=${SECURE_COOKIE}
LITTLE_PRINCE_AGENT_PUBLIC_URL=${PUBLIC_URL}
LITTLE_PRINCE_AGENT_REPO_URL=${repo_public_url}
LITTLE_PRINCE_AGENT_GITHUB_BRANCH=${BRANCH}
EOF_ENV
  as_root install -m 0600 -o root -g root "${tmp}" "${ENV_FILE}"
  rm -f "${tmp}"
}

write_systemd_service() {
  log "Writing systemd service ${SERVICE_NAME}.service..."
  local tmp
  tmp="$(mktemp)"
  cat > "${tmp}" <<EOF_SERVICE
[Unit]
Description=LittlePrince Agent cloud web service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/npm run start:web
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF_SERVICE
  as_root install -m 0644 -o root -g root "${tmp}" "/etc/systemd/system/${SERVICE_NAME}.service"
  rm -f "${tmp}"
  as_root systemctl daemon-reload
  as_root systemctl enable --now "${SERVICE_NAME}.service"
}

print_summary() {
  local token
  token="$(existing_env_value LITTLE_PRINCE_AGENT_API_TOKEN || true)"
  local public_host
  public_host="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ -n "${public_host}" ]] || public_host="SERVER_IP"
  local base_url="${PUBLIC_URL:-http://${public_host}:${PORT}}"

  cat <<EOF_SUMMARY

小王子 Agent 云端网页版已安装。
服务状态:
  systemctl status ${SERVICE_NAME} --no-pager

查看日志:
  journalctl -u ${SERVICE_NAME} -f

首次打开:
  ${base_url}/activation?token=${token}

客户端下载:
  Windows: ${base_url}/downloads/windows
  Debian/Ubuntu: curl -fsSL ${base_url}/downloads/linux-install.sh | bash

安全提醒:
  - 请把 ${ENV_FILE} 里的 LITTLE_PRINCE_AGENT_API_TOKEN 当作密码保存。
  - 公网部署建议使用 HTTPS，并设置 SECURE_COOKIE=true。
  - 如果使用域名/反向代理，建议重新运行时传入 PUBLIC_URL=https://YOUR_DOMAIN。
EOF_SUMMARY
}

main() {
  require_debian_or_ubuntu
  install_packages
  ensure_user_and_dirs
  checkout_repo
  install_node_deps
  write_env_file
  write_systemd_service
  print_summary
}

main "$@"
