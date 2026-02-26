# ══════════════════════════════════════════════════════════════════════════════
#  ENIGMA – ESP-IDF Firmware Builder / Flasher
#
#  Base image:  espressif/idf:v5.3.1  (official Espressif Docker image)
#               Contains full xtensa toolchain, cmake, idf.py, esptool
#
#  Build modes (set via ENV or `docker compose run`):
#    BUILD_ONLY=1    (default)  – clean → set-target → idf.py build
#    FLASH=1                    – build then flash over serial port
#    MONITOR=1                  – open serial monitor after flash
#
#  Serial port is passed through from the host via `devices:` in compose.
# ══════════════════════════════════════════════════════════════════════════════

FROM espressif/idf:v5.3.1

# ── Extra utilities + Python packages for the simulator ──────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        udev \
        usbutils \
        minicom \
        python3-pip \
    && pip3 install --no-cache-dir requests cryptography \
    && rm -rf /var/lib/apt/lists/*

# ── Working directory inside container = mounted firmware source ──────────
WORKDIR /firmware

# ── Environment defaults (override at runtime) ────────────────────────────
ENV IDF_TARGET=esp32s3 \
    PORT=/dev/ttyACM0 \
    BAUD=460800 \
    FLASH=0 \
    MONITOR=0 \
    SIMULATE=0 \
    BACKEND_URL=http://backend:3000 \
    DEVICE_ID=esp32-001-sim \
    ENTROPY_BYTES=64 \
    ENTROPY_INTERVAL_MS=10000 \
    HTTP_TIMEOUT_S=10

# ── Copy entrypoint and simulator ─────────────────────────────────────────
COPY entrypoint.sh /entrypoint.sh
COPY simulate.py   /simulate.py
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
