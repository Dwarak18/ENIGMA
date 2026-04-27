#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${PORT:-/dev/ttyUSB0}"
IMAGE="${IMAGE:-esp32-image}"
CONTAINER="${CONTAINER:-esp32-runner}"
PROJECT_DIR="${PROJECT_DIR:-${ROOT_DIR}/firmware}"
POLL_INTERVAL_S="${POLL_INTERVAL_S:-2}"

log() {
  printf "%s [WATCHER] %s\n" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

container_running() {
  docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"
}

container_exists() {
  docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"
}

start_container() {
  if container_exists; then
    docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  fi

  log "ESP32 connected -> starting container ${CONTAINER}"
  docker run -d \
    --name "${CONTAINER}" \
    --device="${PORT}" \
    -e PORT="${PORT}" \
    -e PROJECT_DIR=/workspace/firmware \
    -v "${PROJECT_DIR}:/workspace/firmware" \
    "${IMAGE}" >/dev/null
}

stop_container() {
  if container_running; then
    log "ESP32 disconnected -> stopping container ${CONTAINER}"
    docker stop "${CONTAINER}" >/dev/null || true
  fi

  if container_exists; then
    docker rm "${CONTAINER}" >/dev/null || true
  fi
}

if ! command -v docker >/dev/null 2>&1; then
  log "ERROR: docker command not found"
  exit 1
fi

if [[ ! -d "${PROJECT_DIR}" ]]; then
  log "ERROR: firmware project directory does not exist: ${PROJECT_DIR}"
  exit 1
fi

log "Started"
log "Watching port: ${PORT}"
log "Image: ${IMAGE}"
log "Container: ${CONTAINER}"
log "Firmware path: ${PROJECT_DIR}"

while true; do
  if [[ -e "${PORT}" ]]; then
    if ! container_running; then
      start_container
    fi
  else
    stop_container
  fi

  sleep "${POLL_INTERVAL_S}"
done
