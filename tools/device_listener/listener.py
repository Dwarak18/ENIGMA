#!/usr/bin/env python3
"""
ENIGMA Device Listener
──────────────────────────────────────────────────────────────────────────────
Event-driven USB/serial device monitor for ESP32-S3 + ATECC608A.

Detection modes
───────────────
  Linux  → pyudev subscribes to kernel udev events instantly (no polling).
  Other  → pyserial polls list_ports every POLL_S seconds (fallback).

Lifecycle
─────────
  Device appears:
    1. Wait SETTLE_S for driver init
    2. Open serial port at BAUD_RATE
    3. Perform ENIGMA handshake  (handshake.py)
       — or skip if SKIP_HANDSHAKE=true (dev / Docker-sim mode)
    4. POST /api/v1/system/device-status
         { device_id, online: true, verified: true/false, com_port, rtc_time }
    5. Backend activates TRNG pipeline

  Device removed:
    1. Detect via udev remove event or polling diff
    2. POST /api/v1/system/device-status  { device_id, online: false }
    3. Backend suspends TRNG pipeline; entropy readers get 503

Windows / Docker Desktop
────────────────────────
  USB passthrough to Docker requires usbipd-win:
    usbipd list
    usbipd bind   --busid <id>
    usbipd attach --wsl --busid <id>
  After attach the device appears as /dev/ttyACM0 or /dev/ttyUSB0 in the
  container, and the udev watcher picks it up automatically.

Environment Variables
─────────────────────
  BACKEND_URL          http://backend:3000
  DEVICE_ID            esp32-001     (default if handshake cannot determine it)
  POLL_S               3             polling interval (fallback mode)
  BAUD_RATE            115200
  SETTLE_S             1.5           seconds to wait after udev add
  HANDSHAKE_TIMEOUT_S  5
  SKIP_HANDSHAKE       false         set true to trust any detected device
"""

import os
import sys
import time
import signal
import logging
import threading
from typing import Optional

import requests
from serial.tools import list_ports

# ── Optional pyudev (Linux only) ─────────────────────────────────────────────
try:
    import pyudev
    _HAS_UDEV = True
except ImportError:
    _HAS_UDEV = False

from handshake import perform_handshake, HandshakeResult

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [device-listener] %(levelname)s %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%SZ',
)
log = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
BACKEND_URL       = os.environ.get('BACKEND_URL',          'http://backend:3000')
DEFAULT_DEVICE_ID = os.environ.get('DEVICE_ID',            'esp32-001')
POLL_S            = float(os.environ.get('POLL_S',         '3'))
BAUD_RATE         = int(os.environ.get('BAUD_RATE',        '115200'))
SETTLE_S          = float(os.environ.get('SETTLE_S',       '1.5'))
HS_TIMEOUT_S      = float(os.environ.get('HANDSHAKE_TIMEOUT_S', '5'))
SKIP_HANDSHAKE    = os.environ.get('SKIP_HANDSHAKE', 'false').lower() == 'true'

DEVICE_STATUS_URL = f"{BACKEND_URL}/api/v1/system/device-status"
STARTUP_RETRY_S   = 5
STARTUP_TIMEOUT_S = 120

# ── USB VID/PID table – all common ESP32 dev-board USB-serial chips ───────────
# (vendor_id, product_id) lowercase hex, no leading zeros beyond 4 chars
ESP32_USB_IDS: list[tuple[str, str]] = [
    ('303a', '1001'),   # Espressif ESP32-S3 native USB
    ('303a', '0002'),   # Espressif ESP32 native USB
    ('10c4', 'ea60'),   # Silicon Labs CP2102 / CP2102N / CP2109
    ('1a86', '7523'),   # QinHeng CH340
    ('1a86', '55d3'),   # QinHeng CH343 (User Device)
    ('1a86', '55d4'),   # QinHeng CH343P
    ('1a86', '7522'),   # QinHeng CH340K
    ('0403', '6001'),   # FTDI FT232RL
    ('0403', '6015'),   # FTDI FT231X
    ('0403', '6010'),   # FTDI FT2232H (dual channel)
]

# Description substrings for the polling fallback (case-insensitive)
ESP32_DESC_KEYWORDS = [
    'ESP32', 'CH340', 'CH341', 'CP210', 'Silicon Labs CP21',
    'FTDI', 'FT232', 'USB Serial', 'USB-SERIAL',
]

# ── State ─────────────────────────────────────────────────────────────────────
_connected: dict[str, str] = {}   # port → device_id
_lock = threading.Lock()


# ══════════════════════════════════════════════════════════════════════════════
#  Backend communication
# ══════════════════════════════════════════════════════════════════════════════

def wait_for_backend() -> None:
    health   = f"{BACKEND_URL}/health"
    deadline = time.monotonic() + STARTUP_TIMEOUT_S
    log.info("Waiting for backend at %s …", health)
    while time.monotonic() < deadline:
        try:
            r = requests.get(health, timeout=3)
            if r.status_code < 500:
                log.info("Backend ready (HTTP %d)", r.status_code)
                return
        except requests.exceptions.RequestException:
            pass
        log.info("  → not ready, retrying in %ds …", STARTUP_RETRY_S)
        time.sleep(STARTUP_RETRY_S)
    raise RuntimeError(f"Backend not reachable within {STARTUP_TIMEOUT_S}s")


def post_status(
    device_id: str,
    online: bool,
    port: str,
    rtc_time: Optional[str] = None,
    verified: bool = False,
) -> bool:
    payload: dict = {
        'device_id': device_id,
        'online':    online,
        'com_port':  port,
        'verified':  verified,
    }
    if rtc_time:
        payload['rtc_time'] = rtc_time
    try:
        r = requests.post(DEVICE_STATUS_URL, json=payload, timeout=5)
        log.info(
            "device-status → %-8s  device=%-20s  port=%-12s  verified=%s  HTTP %d",
            'ONLINE' if online else 'OFFLINE', device_id, port, verified, r.status_code,
        )
        return r.status_code == 200
    except requests.exceptions.RequestException as exc:
        log.warning("post_status failed: %s", exc)
        return False


# ══════════════════════════════════════════════════════════════════════════════
#  USB device identification helpers
# ══════════════════════════════════════════════════════════════════════════════

def _vid_pid_match(vid_str: str, pid_str: str) -> bool:
    v = (vid_str or '').lower().lstrip('0') or '0'
    p = (pid_str or '').lower().lstrip('0') or '0'
    return any(e[0].lstrip('0') == v and e[1].lstrip('0') == p for e in ESP32_USB_IDS)


def _desc_match(description: str) -> bool:
    d = (description or '').upper()
    return any(k.upper() in d for k in ESP32_DESC_KEYWORDS)


# ══════════════════════════════════════════════════════════════════════════════
#  Device connect / disconnect handlers
# ══════════════════════════════════════════════════════════════════════════════

def on_device_connected(port: str) -> None:
    """Called when an ESP32 USB device appears.  Runs in its own thread."""
    with _lock:
        if port in _connected:
            return                           # already tracking this port
        _connected[port] = DEFAULT_DEVICE_ID # placeholder while we handshake

    log.info("Device appeared on %s — settling %.1fs …", port, SETTLE_S)
    time.sleep(SETTLE_S)

    device_id = DEFAULT_DEVICE_ID
    verified  = False
    rtc_time: Optional[str] = None

    if SKIP_HANDSHAKE:
        log.info("SKIP_HANDSHAKE=true — trusting device on %s without challenge", port)
        verified = True
    else:
        try:
            result: HandshakeResult = perform_handshake(
                port=port,
                baud_rate=BAUD_RATE,
                timeout_s=HS_TIMEOUT_S,
            )
            if result.device_id:
                device_id = result.device_id
            rtc_time  = result.rtc_time
            verified  = result.verified

            if not verified:
                log.warning(
                    "Handshake FAILED on %s — device marked unverified (TRNG will NOT activate)",
                    port,
                )
        except Exception as exc:
            log.error("Handshake exception on %s: %s", port, exc)
            verified = False

    with _lock:
        _connected[port] = device_id

    post_status(device_id, online=True, port=port, rtc_time=rtc_time, verified=verified)


def on_device_disconnected(port: str) -> None:
    """Called when an ESP32 USB device is removed."""
    with _lock:
        device_id = _connected.pop(port, DEFAULT_DEVICE_ID)
    log.info("Device removed from %s (device_id=%s)", port, device_id)
    post_status(device_id, online=False, port=port)


# ══════════════════════════════════════════════════════════════════════════════
#  Linux: udev event-driven monitor (preferred)
# ══════════════════════════════════════════════════════════════════════════════

def _port_from_udev_device(device) -> Optional[str]:
    """Walk the udev device tree to find the /dev/ttyXXX node."""
    if device.subsystem == 'tty':
        return device.device_node
    try:
        for child in device.children:
            if child.subsystem == 'tty':
                return child.device_node
    except Exception:
        pass
    return None


def udev_watcher() -> None:
    """
    Subscribe to udev kernel events for USB serial devices.
    Performs a startup scan then blocks on the event loop.
    """
    context = pyudev.Context()
    monitor = pyudev.Monitor.from_netlink(context)
    monitor.filter_by('usb')

    log.info("udev monitor armed — watching USB events (VID/PID table: %d entries) …",
             len(ESP32_USB_IDS))

    # ── Startup scan ──────────────────────────────────────────────────────────
    for dev in context.list_devices(subsystem='tty'):
        vid  = dev.get('ID_VENDOR_ID', '')
        pid  = dev.get('ID_MODEL_ID',  '')
        desc = f"{dev.get('ID_MODEL', '')} {dev.get('ID_VENDOR', '')}"
        if _vid_pid_match(vid, pid) or _desc_match(desc):
            port = dev.device_node
            if port:
                log.info("Startup scan: %s at %s (VID=%s PID=%s)", desc.strip(), port, vid, pid)
                threading.Thread(
                    target=on_device_connected, args=(port,),
                    daemon=True, name=f'hs-{port}',
                ).start()

    # ── Event loop ────────────────────────────────────────────────────────────
    for action, device in monitor:
        try:
            vid  = device.get('ID_VENDOR_ID', '')
            pid  = device.get('ID_MODEL_ID',  '')
            desc = f"{device.get('ID_MODEL', '')} {device.get('ID_VENDOR', '')}"

            if not (_vid_pid_match(vid, pid) or _desc_match(desc)):
                continue

            port = _port_from_udev_device(device)

            # On 'add', /dev/ttyXXX may not exist yet — wait briefly and search
            if not port and action == 'add':
                time.sleep(0.6)
                for tty in context.list_devices(
                        subsystem='tty', ID_BUS='usb',
                        ID_VENDOR_ID=vid, ID_MODEL_ID=pid):
                    port = tty.device_node
                    break

            if not port:
                log.debug("No tty port resolved for udev %s on %s", action, device.sys_name)
                continue

            log.info("udev event: %-8s  %s  port=%s  VID=%s  PID=%s",
                     action.upper(), desc.strip(), port, vid, pid)

            if action == 'add':
                threading.Thread(
                    target=on_device_connected, args=(port,),
                    daemon=True, name=f'hs-{port}',
                ).start()
            elif action == 'remove':
                on_device_disconnected(port)

        except Exception as exc:
            log.error("udev event handler error: %s", exc)


# ══════════════════════════════════════════════════════════════════════════════
#  Fallback: pyserial polling
# ══════════════════════════════════════════════════════════════════════════════

def polling_watcher() -> None:
    """Poll serial.tools.list_ports every POLL_S seconds."""
    log.info("Using serial-port polling (interval: %.1fs) — udev not available …", POLL_S)
    known: dict[str, str] = {}  # port → description

    while True:
        current: dict[str, str] = {}
        for info in list_ports.comports():
            desc = f"{info.description or ''} {info.manufacturer or ''}"
            vid  = format(info.vid, '04x') if info.vid else ''
            pid  = format(info.pid, '04x') if info.pid else ''
            if _vid_pid_match(vid, pid) or _desc_match(desc):
                current[info.device] = desc

        for port in set(current) - set(known):
            log.info("poll: device appeared on %s (%s)", port, current[port].strip())
            threading.Thread(
                target=on_device_connected, args=(port,),
                daemon=True, name=f'hs-{port}',
            ).start()

        for port in set(known) - set(current):
            log.info("poll: device removed from %s", port)
            on_device_disconnected(port)

        known = current
        time.sleep(POLL_S)


# ══════════════════════════════════════════════════════════════════════════════
#  Graceful shutdown
# ══════════════════════════════════════════════════════════════════════════════

def _shutdown(signum, frame):   # noqa: ARG001
    log.info("Shutdown signal — marking all connected devices offline …")
    with _lock:
        items = list(_connected.items())
    for port, device_id in items:
        post_status(device_id, online=False, port=port)
    sys.exit(0)


# ══════════════════════════════════════════════════════════════════════════════
#  Entry point
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    log.info("╔══════════════════════════════════════════════════════════════╗")
    log.info("║       ENIGMA Device Listener                                 ║")
    log.info("║       USB/Serial event monitor for ESP32-S3 + ATECC608A      ║")
    log.info("╚══════════════════════════════════════════════════════════════╝")
    log.info("  backend          : %s", BACKEND_URL)
    log.info("  default device   : %s", DEFAULT_DEVICE_ID)
    log.info("  baud_rate        : %d", BAUD_RATE)
    log.info("  settle_s         : %.1fs", SETTLE_S)
    log.info("  handshake_timeout: %.1fs", HS_TIMEOUT_S)
    log.info("  skip_handshake   : %s", SKIP_HANDSHAKE)
    log.info("  detection mode   : %s", 'udev' if (_HAS_UDEV and sys.platform.startswith('linux')) else 'polling')
    log.info("")

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    wait_for_backend()

    if _HAS_UDEV and sys.platform.startswith('linux'):
        udev_watcher()      # blocks indefinitely on udev event loop
    else:
        polling_watcher()   # blocks indefinitely on poll loop


if __name__ == '__main__':
    main()
