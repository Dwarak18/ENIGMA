#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  ENIGMA – Device Connect Script
#
#  Watches /dev/ttyACM* and /dev/ttyUSB* for an ESP32 device.
#  When a device appears:
#    1. Flashes firmware locally via idf.py or esptool.py (set FLASH=0 to skip)
#    2. POSTs device-status (online=true) directly to the backend
#    3. POSTs device-status (online=true) to the frontend Vite dev proxy
#  When the device disappears:
#    4. POSTs device-status (online=false) to both endpoints
#
#  USAGE:
#    bash tools/device_connect.sh
#
#  ENVIRONMENT OVERRIDES:
#    BACKEND_URL      http://localhost:3000   (direct Node.js API)
#    FRONTEND_URL     http://localhost:5173    (Vite dev server)
#    DEVICE_ID        esp32-001
#    ESP_PORT         /dev/ttyACM0            (serial device path)
#    BAUD             460800
#    FLASH            1                       (set 0 to skip flashing)
#    MONITOR          0                       (set 1 to tail serial after flash)
#    POLL_INTERVAL_S  2                       (how often to scan for new devices)
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"
DEVICE_ID="${DEVICE_ID:-esp32-001}"
ESP_PORT="${ESP_PORT:-}"                      # auto-detect when empty
BAUD="${BAUD:-460800}"
FLASH="${FLASH:-1}"
MONITOR="${MONITOR:-0}"
POLL_INTERVAL_S="${POLL_INTERVAL_S:-2}"

STATUS_ENDPOINT_BACKEND="${BACKEND_URL}/api/v1/system/device-status"
STATUS_ENDPOINT_FRONTEND="${FRONTEND_URL}/api/v1/system/device-status"
HEALTH_BACKEND="${BACKEND_URL}/health"
HEALTH_FRONTEND="${FRONTEND_URL}/"

# Track the firmware container PID so we can report its status
FIRMWARE_PID=""

# ── Helpers ───────────────────────────────────────────────────────────────────
_ts()  { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

log()  {
  local level="$1"; shift
  local color reset
  case "$level" in
    INFO ) color='\033[0;36m'  ;;   # cyan
    WARN ) color='\033[0;33m'  ;;   # yellow
    ERROR) color='\033[0;31m'  ;;   # red
    OK   ) color='\033[0;32m'  ;;   # green
    *    ) color='\033[0m'     ;;
  esac
  reset='\033[0m'
  printf "%s [device_connect] ${color}%-5s${reset} %s\n" "$(_ts)" "$level" "$*"
}

# ── Detect first serial device matching expected paths ────────────────────────
detect_device() {
  # Prefer the user-specified port, then scan for any ACM/USB serial
  if [[ -n "$ESP_PORT" && -e "$ESP_PORT" ]]; then
    echo "$ESP_PORT"
    return
  fi
  for glob in /dev/ttyACM* /dev/ttyUSB*; do
    # glob may be unexpanded if nothing exists
    [[ -e "$glob" ]] && { echo "$glob"; return; }
  done
  echo ""
}

# Return space-separated list of all current serial device paths
list_devices() {
  local found=()
  for glob in /dev/ttyACM* /dev/ttyUSB*; do
    [[ -e "$glob" ]] && found+=("$glob")
  done
  echo "${found[*]:-}"
}

# ── Backend / frontend health wait ────────────────────────────────────────────
wait_for_service() {
  local label="$1" url="$2" max="$3"
  log INFO "Waiting for $label at $url ..."
  local i=0
  while (( i < max )); do
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$url" 2>/dev/null || true)
    if [[ "$http_code" =~ ^[23] ]]; then
      log OK   "$label is up (HTTP $http_code)"
      return 0
    fi
    (( i++ ))
    sleep 3
  done
  log WARN "$label did not respond after $((max * 3))s – continuing anyway"
  return 1
}

# ── Send device-status payload ────────────────────────────────────────────────
#    $1 = endpoint URL
#    $2 = device_id
#    $3 = online (true|false)
#    $4 = com_port
send_status() {
  local endpoint="$1" did="$2" online="$3" port="$4"
  local payload
  payload=$(printf '{"device_id":"%s","online":%s,"com_port":"%s"}' \
            "$did" "$online" "$port")
  local http_code
  http_code=$(
    curl -s -o /dev/null -w "%{http_code}" \
      --max-time 5 \
      -X POST \
      -H 'Content-Type: application/json' \
      -d "$payload" \
      "$endpoint" 2>/dev/null || echo "000"
  )
  if [[ "$http_code" =~ ^2 ]]; then
    log OK   "POST $endpoint  device_id=$did online=$online  => HTTP $http_code"
  else
    log WARN "POST $endpoint  device_id=$did online=$online  => HTTP $http_code (unreachable or error)"
  fi
}

# ── Broadcast to both backend and frontend ────────────────────────────────────
broadcast_status() {
  local did="$1" online="$2" port="$3"
  send_status "$STATUS_ENDPOINT_BACKEND" "$did" "$online" "$port"
  send_status "$STATUS_ENDPOINT_FRONTEND" "$did" "$online" "$port"
}

# ── Optional: flash/monitor the device locally (no Docker) ──────────────────
#  Requires ESP-IDF installed locally or esptool.py reachable via PATH.
#  Set FLASH=0 to skip flashing entirely (just report device status).
start_firmware() {
  local port="$1"

  if [[ "$FLASH" != "1" ]]; then
    log INFO "FLASH=0 – skipping firmware flash for $port"
    FIRMWARE_PID=""
    return
  fi

  if command -v idf.py &>/dev/null; then
    log INFO "Flashing via idf.py  (PORT=$port BAUD=$BAUD)"
    (
      cd "$(dirname "$0")/../firmware"
      idf.py -p "$port" -b "$BAUD" flash ${MONITOR:+monitor}
    ) &
    FIRMWARE_PID=$!
    log OK "idf.py flash started in background (PID=$FIRMWARE_PID)"
  elif command -v esptool.py &>/dev/null || python3 -m esptool --help &>/dev/null 2>&1; then
    log INFO "Flashing via esptool.py  (PORT=$port BAUD=$BAUD)"
    (
      python3 -m esptool --chip esp32s3 --port "$port" --baud "$BAUD" write_flash 0x0 \
        "$(dirname "$0")/../firmware/build/enigma.bin"
    ) &
    FIRMWARE_PID=$!
    log OK "esptool.py flash started in background (PID=$FIRMWARE_PID)"
  else
    log WARN "Neither idf.py nor esptool.py found – skipping firmware flash"
    log WARN "Install ESP-IDF or run:  pip install esptool"
    FIRMWARE_PID=""
  fi
}

# ── On-connect handler ────────────────────────────────────────────────────────
on_device_connect() {
  local port="$1"
  local did="$DEVICE_ID"
  [[ -n "${PORT_DEVICE_MAP[$port]+x}" ]] && did="${PORT_DEVICE_MAP[$port]}"

  log INFO "══ DEVICE CONNECTED  port=$port  device_id=$did ══"

  # 1. Flash firmware locally (requires idf.py or esptool.py; set FLASH=0 to skip)
  start_firmware "$port"

  # 2. Send device-status=online to backend (direct) and frontend (Vite proxy)
  broadcast_status "$did" "true" "$port"
}

# ── On-disconnect handler ─────────────────────────────────────────────────────
on_device_disconnect() {
  local port="$1"
  local did="$DEVICE_ID"
  [[ -n "${PORT_DEVICE_MAP[$port]+x}" ]] && did="${PORT_DEVICE_MAP[$port]}"

  log INFO "══ DEVICE DISCONNECTED  port=$port  device_id=$did ══"

  # Notify backend + frontend that device is offline
  broadcast_status "$did" "false" "$port"

  # If the firmware container is still running, it will exit naturally when
  # the serial port disappears.  We do a soft wait but do not force-kill it.
  if [[ -n "$FIRMWARE_PID" ]] && kill -0 "$FIRMWARE_PID" 2>/dev/null; then
    log INFO "Firmware container process (PID=$FIRMWARE_PID) still alive – letting it exit naturally"
  fi
  FIRMWARE_PID=""
}

# ── Optional port → device_id map  ───────────────────────────────────────────
# Populated by environment variables:  PORT_MAP_ttyACM0=esp32-001
#                                       PORT_MAP_ttyUSB1=esp32-002
declare -A PORT_DEVICE_MAP=()
while IFS='=' read -r key value; do
  if [[ "$key" =~ ^PORT_MAP_(.+)$ ]]; then
    PORT_DEVICE_MAP["/dev/${BASH_REMATCH[1]}"]="$value"
  fi
done < <(env)

# ══════════════════════════════════════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "====================================================================="
printf "        ENIGMA – Device Connect Script\n"
echo "====================================================================="
echo ""
log INFO "Backend  (direct)     : $BACKEND_URL"
log INFO "Frontend (nginx proxy): $FRONTEND_URL"
log INFO "Default device_id     : $DEVICE_ID"
log INFO "FLASH=$FLASH  MONITOR=$MONITOR  BAUD=$BAUD"
echo ""

# Wait until both services are reachable before entering the watch loop
wait_for_service "backend"  "$HEALTH_BACKEND"  20 || true
wait_for_service "frontend" "$HEALTH_FRONTEND" 10 || true
echo ""

# Initial scan – treat any device already connected as a fresh connect
declare -A known_ports=()
initial_devices=$(list_devices)
if [[ -n "$initial_devices" ]]; then
  for p in $initial_devices; do
    log INFO "Pre-existing device detected: $p"
    known_ports["$p"]=1
    on_device_connect "$p"
  done
else
  log INFO "No devices currently connected – watching for plug events ..."
fi

echo ""
log INFO "Poll loop active  (interval=${POLL_INTERVAL_S}s)  Ctrl-C to exit"
echo ""

# ── Poll loop ─────────────────────────────────────────────────────────────────
trap 'log INFO "Interrupted – exiting ..."; exit 0' INT TERM

while true; do
  sleep "$POLL_INTERVAL_S"

  declare -A current_ports=()
  current_raw=$(list_devices)
  for p in $current_raw; do
    current_ports["$p"]=1
  done

  # Newly appeared ports
  for p in "${!current_ports[@]}"; do
    if [[ -z "${known_ports[$p]+x}" ]]; then
      known_ports["$p"]=1
      on_device_connect "$p"
    fi
  done

  # Disappeared ports
  for p in "${!known_ports[@]}"; do
    if [[ -z "${current_ports[$p]+x}" ]]; then
      unset 'known_ports[$p]'
      on_device_disconnect "$p"
    fi
  done
done
