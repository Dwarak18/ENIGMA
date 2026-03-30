#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  ENIGMA – Local Run Script
#
#  Starts the full stack locally (no Docker):
#    1. Verify PostgreSQL is reachable
#    2. Install npm dependencies (backend + frontend) if node_modules missing
#    3. Run DB migrations
#    4. Start backend  (Node.js, port 3000)
#    5. Start frontend (Vite dev server, port 5173)
#
#  Prerequisites:
#    • PostgreSQL running locally with:
#        user:     enigma
#        password: changeme
#        db:       enigma_db
#      Quick setup:
#        createuser -s enigma
#        psql -c "ALTER USER enigma WITH PASSWORD 'changeme';"
#        createdb -O enigma enigma_db
#    • Node.js >= 18
#    • (Optional) Python 3 + pip for firmware simulator
#
#  USAGE:
#    bash tools/start.sh
#
#  To also run the firmware simulator:
#    SIMULATE=1 bash tools/start.sh
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
FIRMWARE_DIR="$ROOT/firmware"

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
SIMULATE="${SIMULATE:-0}"

BACKEND_PID=""
FRONTEND_PID=""
SIM_PID=""

# ── Helpers ───────────────────────────────────────────────────────────────────
_ts()  { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

log() {
  local level="$1"; shift
  local color reset
  case "$level" in
    INFO ) color='\033[0;36m'  ;;
    WARN ) color='\033[0;33m'  ;;
    ERROR) color='\033[0;31m'  ;;
    OK   ) color='\033[0;32m'  ;;
    *    ) color='\033[0m'     ;;
  esac
  reset='\033[0m'
  printf "%s [start] ${color}%-5s${reset} %s\n" "$(_ts)" "$level" "$*"
}

die() { log ERROR "$*"; exit 1; }

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  log INFO "Shutting down ..."
  [[ -n "$SIM_PID"      ]] && kill "$SIM_PID"      2>/dev/null || true
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID"  ]] && kill "$BACKEND_PID"  2>/dev/null || true
  log INFO "All processes stopped."
}
trap cleanup EXIT INT TERM

# ── 1. PostgreSQL check ───────────────────────────────────────────────────────
check_postgres() {
  log INFO "Checking PostgreSQL connection ..."
  # Load DATABASE_URL from .env if present
  local db_url="${DATABASE_URL:-}"
  if [[ -z "$db_url" && -f "$BACKEND_DIR/.env" ]]; then
    db_url=$(grep -E '^DATABASE_URL=' "$BACKEND_DIR/.env" | cut -d= -f2-)
  fi
  db_url="${db_url:-postgresql://enigma:changeme@localhost:5432/enigma_db}"

  # Extract host and port for a simple TCP probe
  local host port
  host=$(echo "$db_url" | sed -E 's|.*@([^:/]+).*|\1|')
  port=$(echo "$db_url" | sed -E 's|.*:([0-9]+)/.*|\1|')
  host="${host:-localhost}"
  port="${port:-5432}"

  local i=0
  while (( i < 15 )); do
    if (echo > /dev/tcp/"$host"/"$port") 2>/dev/null; then
      log OK "PostgreSQL reachable at $host:$port"
      return 0
    fi
    (( i++ ))
    log WARN "PostgreSQL not reachable yet ($host:$port) – retrying in 2s ... ($i/15)"
    sleep 2
  done
  die "PostgreSQL is not reachable at $host:$port after 30s.
  Make sure PostgreSQL is running and the enigma user/database exist:
    createuser -s enigma
    psql -c \"ALTER USER enigma WITH PASSWORD 'changeme';\"
    createdb -O enigma enigma_db"
}

# ── 2. Install npm deps ────────────────────────────────────────────────────────
install_deps() {
  local dir="$1" label="$2"
  if [[ ! -d "$dir/node_modules" ]]; then
    log INFO "Installing $label dependencies ..."
    (cd "$dir" && npm install) || die "$label npm install failed"
    log OK "$label dependencies installed"
  else
    log INFO "$label node_modules already present – skipping install"
  fi
}

# ── 3. Run DB migration ────────────────────────────────────────────────────────
run_migration() {
  log INFO "Running database migrations ..."
  (cd "$BACKEND_DIR" && node src/db/migrate.js) || die "Migration failed"
  log OK "Migrations complete"
}

# ── 4. Start backend ──────────────────────────────────────────────────────────
start_backend() {
  log INFO "Starting backend (Node.js) on port 3000 ..."
  (
    cd "$BACKEND_DIR"
    # Use nodemon in dev, plain node otherwise
    if [[ -x "$(command -v npx)" ]] && [[ -f "node_modules/.bin/nodemon" ]]; then
      exec npx nodemon src/index.js
    else
      exec node src/index.js
    fi
  ) &
  BACKEND_PID=$!
  log OK "Backend started (PID=$BACKEND_PID)"
}

# ── 5. Start frontend ─────────────────────────────────────────────────────────
start_frontend() {
  log INFO "Starting frontend (Vite) on port 5173 ..."
  (cd "$FRONTEND_DIR" && exec npx vite) &
  FRONTEND_PID=$!
  log OK "Frontend started (PID=$FRONTEND_PID)"
}

# ── 6. Optional: firmware simulator ──────────────────────────────────────────
start_simulator() {
  if [[ "$SIMULATE" != "1" ]]; then return; fi
  log INFO "Starting firmware simulator (simulate.py) ..."
  if ! command -v python3 &>/dev/null; then
    log WARN "python3 not found – skipping simulator"
    return
  fi
  # Install Python deps if needed
  if ! python3 -c "import requests, cryptography" 2>/dev/null; then
    log INFO "Installing Python deps for simulator ..."
    pip3 install --quiet requests cryptography || {
      log WARN "pip3 install failed – skipping simulator"
      return
    }
  fi
  (
    cd "$FIRMWARE_DIR"
    BACKEND_URL="http://localhost:3000" \
    DEVICE_ID="${DEVICE_ID:-esp32-001-sim}" \
    ENTROPY_INTERVAL_MS="${ENTROPY_INTERVAL_MS:-10000}" \
    exec python3 simulate.py
  ) &
  SIM_PID=$!
  log OK "Firmware simulator started (PID=$SIM_PID)"
}

# ── Wait for backend health ────────────────────────────────────────────────────
wait_for_backend() {
  log INFO "Waiting for backend to be ready ..."
  local i=0
  while (( i < 30 )); do
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 \
           "$BACKEND_URL/health" 2>/dev/null || echo "000")
    if [[ "$code" =~ ^[23] ]]; then
      log OK "Backend ready (HTTP $code)"
      return 0
    fi
    (( i++ ))
    sleep 1
  done
  log WARN "Backend health check timed out – it may still be starting"
}

# ══════════════════════════════════════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "====================================================================="
printf "        ENIGMA – Local Stack\n"
echo "====================================================================="
echo ""

check_postgres
echo ""

install_deps "$BACKEND_DIR"  "backend"
install_deps "$FRONTEND_DIR" "frontend"
echo ""

run_migration
echo ""

start_backend
wait_for_backend
echo ""

start_frontend
start_simulator
echo ""

log OK "Stack is up:"
log OK "  Backend  → http://localhost:3000"
log OK "  Frontend → http://localhost:5173"
[[ "$SIMULATE" == "1" ]] && log OK "  Simulator running (DEVICE_ID=${DEVICE_ID:-esp32-001-sim})"
echo ""
log INFO "Press Ctrl-C to stop everything."
echo ""

# ── Keep script alive, restart crashed processes ────────────────────────────
while true; do
  sleep 5

  # Backend watchdog
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    log WARN "Backend exited unexpectedly – restarting ..."
    start_backend
    wait_for_backend
  fi

  # Frontend watchdog
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    log WARN "Frontend exited unexpectedly – restarting ..."
    start_frontend
  fi

  # Simulator watchdog
  if [[ "$SIMULATE" == "1" ]] && [[ -n "$SIM_PID" ]] && ! kill -0 "$SIM_PID" 2>/dev/null; then
    log WARN "Simulator exited – restarting ..."
    start_simulator
  fi
done
