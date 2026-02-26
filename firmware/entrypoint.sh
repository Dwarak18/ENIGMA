#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  ENIGMA Firmware – Docker entrypoint
#
#  Env vars (all have defaults):
#    IDF_TARGET   esp32s3          target chip
#    PORT         /dev/ttyACM0     serial port for flash / monitor
#    BAUD         460800           flash baud rate
#    FLASH        0                set 1 to flash after build
#    MONITOR      0                set 1 to open serial monitor after flash
# ══════════════════════════════════════════════════════════════════════════════

set -e

# ── Simulation shortcut (SIMULATE=1) ──────────────────────────────────────
# Skip the ESP-IDF build entirely and run the Python entropy simulator.
# The simulator mimics the ESP32 firmware: generates entropy, signs it with
# ECDSA P-256, and POSTs to the backend on every ENTROPY_INTERVAL_MS cycle.
if [ "${SIMULATE}" = "1" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║       ENIGMA Firmware Simulator – SIMULATE=1 mode            ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    exec python3 /simulate.py
fi

# Source ESP-IDF environment (provided by the espressif/idf image)
# shellcheck disable=SC1091
source /opt/esp/idf/export.sh > /dev/null 2>&1

cd /firmware

# ── 1. Clean previous build completely ────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        ENIGMA Firmware Builder – ESP-IDF Docker              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "[1/4] Cleaning previous build artifacts…"
rm -rf build/
echo "      Done – build/ removed."

# ── 2. Set chip target ────────────────────────────────────────────────────
echo ""
echo "[2/4] Setting IDF target: ${IDF_TARGET}"
idf.py set-target "${IDF_TARGET}"

# ── 3. Build ──────────────────────────────────────────────────────────────
echo ""
echo "[3/4] Building firmware (this takes a few minutes on first run)…"
idf.py build

echo ""
echo "      ✓ Build successful"
echo "      Binary: build/enigma_firmware.bin"
echo "      Size  : $(du -sh build/enigma_firmware.bin 2>/dev/null | cut -f1)"

# ── 4. Flash (optional) ───────────────────────────────────────────────────
if [ "${FLASH}" = "1" ]; then
    echo ""
    echo "[4/4] Flashing to ${PORT} @ ${BAUD} baud…"

    # Verify the port exists
    if [ ! -e "${PORT}" ]; then
        echo ""
        echo "  ERROR: Serial port ${PORT} not found inside the container."
        echo ""
        echo "  On Windows you need to share the COM port to WSL2 first:"
        echo "    1. Install usbipd-win:  winget install usbipd"
        echo "    2. List devices:        usbipd list"
        echo "    3. Bind the ESP32 port: usbipd bind --busid <BUSID>"
        echo "    4. Attach to WSL:       usbipd attach --wsl --busid <BUSID>"
        echo "    5. Verify in WSL:       ls /dev/ttyACM* /dev/ttyUSB*"
        echo "    6. Re-run:              docker compose --profile firmware run --rm firmware"
        echo ""
        exit 1
    fi

    idf.py -p "${PORT}" -b "${BAUD}" flash

    echo ""
    echo "      ✓ Flash complete"

    # ── 5. Monitor (optional) ──────────────────────────────────────────
    if [ "${MONITOR}" = "1" ]; then
        echo ""
        echo "[5/5] Opening serial monitor on ${PORT} (Ctrl+] to exit)…"
        echo ""
        idf.py -p "${PORT}" monitor
    fi
else
    echo ""
    echo "[4/4] Flash skipped (FLASH=0)."
    echo ""
    echo "  To flash, rebuild with:"
    echo "    docker compose --profile firmware run --rm \\"
    echo "      -e FLASH=1 -e MONITOR=1 firmware"
    echo ""
fi

echo "══════════════════════════════════════════════════════════════"
echo "  Done."
echo "══════════════════════════════════════════════════════════════"
