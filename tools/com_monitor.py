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
import subprocess
import pathlib
import requests

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [com_monitor] %(levelname)s %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
log = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────
BACKEND_URL       = os.environ.get('BACKEND_URL',       'http://localhost')
DEFAULT_DEVICE_ID = os.environ.get('DEVICE_ID',         'esp32-001')
POLL_S            = int(os.environ.get('POLL_S',         '3'))

# The specific COM port to watch for the ENIGMA ESP32 device.
TARGET_PORT = os.environ.get('TARGET_COM_PORT', 'COM7').upper()

# Path to the firmware Python simulator — resolved relative to this script.
_TOOLS_DIR      = pathlib.Path(__file__).parent
FIRMWARE_SCRIPT = os.environ.get(
    'FIRMWARE_SCRIPT',
    str(_TOOLS_DIR.parent / 'firmware' / 'simulate.py'),
)
# Backend URL forwarded to the simulator process (may differ from BACKEND_URL
# if the monitor runs outside Docker while the backend runs inside).
SIMULATOR_BACKEND_URL = os.environ.get('SIMULATOR_BACKEND_URL', 'http://localhost:3000')

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

# ── Map TARGET_PORT → device_id (all other ports use DEFAULT_DEVICE_ID) ───
PORT_TO_DEVICE: dict[str, str] = {TARGET_PORT: DEFAULT_DEVICE_ID}


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


# ══════════════════════════════════════════════════════════════════════════
#  Firmware simulator subprocess management
# ══════════════════════════════════════════════════════════════════════════

_sim_proc: subprocess.Popen | None = None
_sim_lock = threading.Lock()


def _pipe_sim_output(proc: subprocess.Popen) -> None:
    """Forward simulator stdout/stderr to our logger (runs in daemon thread)."""
    assert proc.stdout
    for raw in iter(proc.stdout.readline, b''):
        log.info('[sim] %s', raw.decode(errors='replace').rstrip())


def launch_firmware(device_id: str, com_port: str) -> None:
    """Spawn firmware/simulate.py as a subprocess for the connected device."""
    global _sim_proc
    with _sim_lock:
        if _sim_proc and _sim_proc.poll() is None:
            log.info('Firmware simulator already running (pid=%d)', _sim_proc.pid)
            return
        sim_path = pathlib.Path(FIRMWARE_SCRIPT)
        if not sim_path.is_file():
            log.error('Firmware simulator not found: %s', sim_path)
            return
        env = os.environ.copy()
        env['BACKEND_URL'] = SIMULATOR_BACKEND_URL
        env['DEVICE_ID']   = device_id
        try:
            _sim_proc = subprocess.Popen(
                [sys.executable, str(sim_path)],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
            log.info(
                '✓ Firmware simulator started  pid=%-6d  device=%s  port=%s',
                _sim_proc.pid, device_id, com_port,
            )
            threading.Thread(
                target=_pipe_sim_output,
                args=(_sim_proc,),
                daemon=True,
                name='sim-pipe',
            ).start()
        except Exception as exc:
            log.error('Failed to launch firmware simulator: %s', exc)


def stop_firmware(device_id: str) -> None:
    """Terminate the running firmware simulator subprocess."""
    global _sim_proc
    with _sim_lock:
        if not _sim_proc or _sim_proc.poll() is not None:
            log.info('No running firmware simulator to stop.')
            return
        pid = _sim_proc.pid
        log.info('Stopping firmware simulator  pid=%-6d  device=%s', pid, device_id)
        _sim_proc.terminate()
        try:
            _sim_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            log.warning('Simulator did not exit; sending SIGKILL  pid=%d', pid)
            _sim_proc.kill()
        _sim_proc = None
        log.info('Firmware simulator stopped  pid=%d', pid)


def post_status(device_id: str, online: bool, com_port: str | None) -> None:
    payload = {'device_id': device_id, 'online': online, 'com_port': com_port}
    try:
        r = requests.post(DEVICE_STATUS_URL, json=payload, timeout=5)
        if r.status_code == 200:
            state = 'CONNECTED' if online else 'DISCONNECTED'
            log.info('✓ %-12s %s  (port=%s)', device_id, state, com_port or '?')
            # Automatically start / stop the firmware simulator when the
            # target COM port (default: COM7) is plugged or unplugged.
            if com_port and com_port.upper() == TARGET_PORT:
                if online:
                    launch_firmware(device_id, com_port)
                else:
                    stop_firmware(device_id)
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
    log.info('  backend    : %s', BACKEND_URL)
    log.info('  device     : %s (default)', DEFAULT_DEVICE_ID)
    log.info('  target port: %s  ← firmware auto-launch enabled', TARGET_PORT)
    log.info('  simulator  : %s', FIRMWARE_SCRIPT)
    log.info('  sim backend: %s', SIMULATOR_BACKEND_URL)
    log.info('  watching   : %s', ', '.join(ESP32_SIGNATURES[:4]) + '…')
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
