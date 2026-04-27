#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-/dev/ttyUSB0}"
PROJECT_DIR="${PROJECT_DIR:-/workspace/firmware}"

echo "[RUNNER] Checking for ESP32 on ${PORT} ..."
if [[ ! -e "${PORT}" ]]; then
  echo "[RUNNER][ERROR] ESP32 not found on ${PORT}"
  exit 1
fi

echo "[RUNNER] ESP32 detected on ${PORT}"

if [[ ! -d "${PROJECT_DIR}" ]]; then
  echo "[RUNNER][ERROR] Firmware project directory missing: ${PROJECT_DIR}"
  echo "[RUNNER][HINT] Mount your firmware project to ${PROJECT_DIR}"
  exit 1
fi

cd "${PROJECT_DIR}"

echo "[RUNNER] Starting flash + monitor"
idf.py -p "${PORT}" flash monitor
