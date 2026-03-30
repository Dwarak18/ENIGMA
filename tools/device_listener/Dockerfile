# ── ENIGMA Device Listener ──────────────────────────────────────────────────
# Runs inside the enigma_net Docker network with privileged access to the
# host /dev tree and udev socket so it can detect USB ESP32 serial events.
#
# Hardware passthrough (Linux host):
#   • Mount /dev:/dev              — to see ttyUSB* / ttyACM* nodes
#   • Mount /run/udev:/run/udev:ro — for udev event subscription
#   • privileged: true             — grants necessary capabilities
#
# Windows (Docker Desktop / WSL2) — attach device to WSL2 first:
#   powershell (admin):
#     usbipd list
#     usbipd bind   --busid <id>
#     usbipd attach --wsl --busid <id>
#   The device then appears as /dev/ttyACM0 or /dev/ttyUSB0 inside the
#   container and udev picks it up automatically.
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

# libudev1 is required at runtime by pyudev Monitor
RUN apt-get update && \
    apt-get install -y --no-install-recommends libudev1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py .

CMD ["python", "-u", "listener.py"]
