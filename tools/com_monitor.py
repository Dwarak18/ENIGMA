#!/usr/bin/env python3
"""
ENIGMA – Windows COM Port Monitor
──────────────────────────────────
Watches for ESP32 (CH340 / CP210x / FTDI) devices being plugged or unplugged
on Windows COM ports using WMI real-time events.

When a matching device appears  → POST { device_id, online: true,  com_port }
When a matching device disappears → POST { device_id, online: false, com_port }

The backend instantly emits a `device:status` WebSocket event so the dashboard
switches between CONNECTED / PAIRED / OFFLINE in real time.

Usage:
    pip install wmi requests
    python tools/com_monitor.py

Environment variables:
    BACKEND_URL   http://localhost        (default)
    DEVICE_ID     esp32-001              (default – overridden per device below)
    POLL_S        3                       fallback poll interval (seconds)

Requires: Windows, Python 3.8+, pywin32 + wmi
    pip install pywin32 wmi requests
"""

import os
import sys
import time
import logging
import threading
import requests

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [com_monitor] %(levelname)s %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
log = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost')
DEFAULT_DEVICE_ID = os.environ.get('DEVICE_ID', 'esp32-001')
POLL_S      = int(os.environ.get('POLL_S', '3'))

DEVICE_STATUS_URL = f"{BACKEND_URL}/api/v1/system/device-status"

# ── USB-serial chip signatures (case-insensitive substring match) ──────────
# These are the USB-serial bridge chips used on most ESP32 dev boards.
ESP32_SIGNATURES = [
    'CH340',
    'CH341',
    'CP210',     # CP2102, CP2104, CP2109
    'Silicon Labs CP210',
    'FTDI',
    'FT232',
    'USB Serial',
    'USB-SERIAL',
    'ESP32',
    'ESP32-S3',
]

# ── Optional: map COM port name → device_id ───────────────────────────────
# e.g.  PORT_TO_DEVICE = {'COM5': 'esp32-001', 'COM6': 'esp32-002'}
# If a port is not in this dict the DEFAULT_DEVICE_ID is used.
PORT_TO_DEVICE: dict[str, str] = {}


# ══════════════════════════════════════════════════════════════════════════
#  Helpers
# ══════════════════════════════════════════════════════════════════════════

def is_esp32_device(description: str) -> bool:
    desc_up = (description or '').upper()
    return any(sig.upper() in desc_up for sig in ESP32_SIGNATURES)


def extract_com_port(description: str, name: str) -> str | None:
    """Pull 'COMx' out of a PnP entity name/description."""
    import re
    for text in (name or '', description or ''):
        m = re.search(r'(COM\d+)', text, re.IGNORECASE)
        if m:
            return m.group(1).upper()
    return None


def device_id_for_port(com_port: str | None) -> str:
    if com_port and com_port in PORT_TO_DEVICE:
        return PORT_TO_DEVICE[com_port]
    return DEFAULT_DEVICE_ID


def post_status(device_id: str, online: bool, com_port: str | None) -> None:
    payload = {'device_id': device_id, 'online': online, 'com_port': com_port}
    try:
        r = requests.post(DEVICE_STATUS_URL, json=payload, timeout=5)
        if r.status_code == 200:
            state = 'CONNECTED' if online else 'DISCONNECTED'
            log.info('✓ %-12s %s  (port=%s)', device_id, state, com_port or '?')
        else:
            log.warning('Backend returned HTTP %d: %s', r.status_code, r.text[:200])
    except requests.exceptions.ConnectionError:
        log.warning('Cannot reach backend at %s — is Docker running?', BACKEND_URL)
    except Exception as exc:
        log.error('post_status error: %s', exc)


# ══════════════════════════════════════════════════════════════════════════
#  WMI real-time event watcher
# ══════════════════════════════════════════════════════════════════════════

def wmi_watcher() -> None:
    """
    Subscribe to WMI PnP creation/deletion events.
    Runs in its own thread — never returns.
    """
    try:
        import wmi
    except ImportError:
        log.error("'wmi' package not found. Run:  pip install wmi pywin32")
        return

    c = wmi.WMI()

    # Watch for new COM-port devices being added
    watcher_add = c.watch_for(
        notification_type='Creation',
        wmi_class='Win32_PnPEntity',
        delay_secs=1,
    )
    # Watch for COM-port devices being removed
    watcher_del = c.watch_for(
        notification_type='Deletion',
        wmi_class='Win32_PnPEntity',
        delay_secs=1,
    )

    log.info('WMI event watchers armed — plug in your ESP32 ...')

    # Dispatch both watchers in separate threads
    def _watch(watcher, online: bool) -> None:
        while True:
            try:
                event = watcher(timeout_ms=5000)
                desc  = getattr(event, 'Description', '') or ''
                name  = getattr(event, 'Name', '')        or ''
                caption = getattr(event, 'Caption', '')   or ''
                combined = f"{desc} {name} {caption}"

                if not is_esp32_device(combined):
                    continue

                com_port  = extract_com_port(combined, name)
                device_id = device_id_for_port(com_port)
                post_status(device_id, online, com_port)

            except wmi.x_wmi_timed_out:
                pass   # normal — no event in the timeout window
            except Exception as exc:
                log.error('WMI watcher error: %s', exc)
                time.sleep(2)

    t_add = threading.Thread(target=_watch, args=(watcher_add, True),  daemon=True, name='wmi-add')
    t_del = threading.Thread(target=_watch, args=(watcher_del, False), daemon=True, name='wmi-del')
    t_add.start()
    t_del.start()
    t_add.join()
    t_del.join()


# ══════════════════════════════════════════════════════════════════════════
#  Fallback: polling via serial.tools.list_ports
# ══════════════════════════════════════════════════════════════════════════

def polling_watcher() -> None:
    """
    Fallback if WMI is unavailable.
    Polls serial ports every POLL_S seconds and detects changes.
    """
    try:
        from serial.tools import list_ports
    except ImportError:
        log.error("'pyserial' not found. Run:  pip install pyserial")
        sys.exit(1)

    log.info('Using serial-port polling (interval: %ds) — WMI not available', POLL_S)
    known: dict[str, str] = {}   # com_port → device_id

    while True:
        current: dict[str, str] = {}
        for port in list_ports.comports():
            desc = f"{port.description} {port.manufacturer or ''}"
            if is_esp32_device(desc):
                device_id = device_id_for_port(port.device.upper())
                current[port.device.upper()] = device_id

        # Newly appeared
        for port, device_id in current.items():
            if port not in known:
                post_status(device_id, True, port)

        # Disappeared
        for port, device_id in known.items():
            if port not in current:
                post_status(device_id, False, port)

        known = current
        time.sleep(POLL_S)


# ══════════════════════════════════════════════════════════════════════════
#  Startup scan – report any already-connected ESP32 devices
# ══════════════════════════════════════════════════════════════════════════

def initial_scan() -> None:
    """Report devices that are already plugged in when the monitor starts."""
    try:
        from serial.tools import list_ports
        found = []
        for port in list_ports.comports():
            desc = f"{port.description} {port.manufacturer or ''}"
            if is_esp32_device(desc):
                found.append((port.device.upper(), desc.strip()))

        if found:
            log.info('Found %d ESP32 device(s) already connected:', len(found))
            for com, desc in found:
                device_id = device_id_for_port(com)
                log.info('  %-6s  %s  →  device_id=%s', com, desc, device_id)
                post_status(device_id, True, com)
        else:
            log.info('No ESP32 devices currently connected.')
    except ImportError:
        pass   # pyserial not installed — skip initial scan


# ══════════════════════════════════════════════════════════════════════════
#  Entry point
# ══════════════════════════════════════════════════════════════════════════

def main() -> None:
    if sys.platform != 'win32':
        log.error('com_monitor.py is Windows-only (uses WMI / COM ports).')
        sys.exit(1)

    log.info('╔══════════════════════════════════════════════════════════════╗')
    log.info('║         ENIGMA – ESP32 COM Port Monitor                      ║')
    log.info('╚══════════════════════════════════════════════════════════════╝')
    log.info('  backend : %s', BACKEND_URL)
    log.info('  device  : %s (default)', DEFAULT_DEVICE_ID)
    log.info('  watching: %s', ', '.join(ESP32_SIGNATURES[:4]) + '…')
    log.info('')

    # Wait for backend to be reachable
    log.info('Waiting for backend ...')
    for _ in range(20):
        try:
            r = requests.get(f"{BACKEND_URL}/health", timeout=3)
            if r.status_code < 500:
                log.info('Backend ready (%d)', r.status_code)
                break
        except requests.exceptions.RequestException:
            pass
        time.sleep(3)
    else:
        log.warning('Backend unreachable — will retry on each event anyway.')

    # Initial scan for already-connected devices
    initial_scan()

    # Try WMI real-time events first; fall back to polling
    try:
        import wmi   # noqa: F401
        wmi_thread = threading.Thread(target=wmi_watcher, daemon=False, name='wmi-main')
        wmi_thread.start()
        wmi_thread.join()
    except ImportError:
        log.warning('wmi module not found — falling back to polling mode.')
        polling_watcher()


if __name__ == '__main__':
    main()
