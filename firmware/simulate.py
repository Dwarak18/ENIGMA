#!/usr/bin/env python3
"""
ENIGMA Pro Firmware Simulator
──────────────────────────────
Reproduces exactly what the ESP32 Enigma_pro.c firmware does on every cycle:

  1.  Generate 16 random bytes (plaintext entropy)
  2.  Generate a fresh 16-byte random IV
  3.  AES-256-CBC encrypt the plaintext          → 16-byte ciphertext
  4.  Build IST (UTC+5:30) datetime string       "YYYY-MM-DD HH:MM:SS"
  5.  SHA-256( AES_key[32] ‖ IST_datetime_str )  → 32-byte entropy_hash
  6.  ECDSA/P-256 sign the entropy_hash          → 64-byte raw signature
       (backend verifier applies SHA-256 before the ECDSA check, so we
        use ec.ECDSA(hashes.SHA256()) to produce a matching signature)
  7.  POST JSON payload to /api/v1/entropy with:
        device_id, timestamp, entropy_hash, signature,
        rtc_time (HH:MM:SS IST), aes_ciphertext, aes_iv,
        public_key (first cycle only)
  8.  Sleep for ENTROPY_INTERVAL_MS, repeat

The AES-256 key is generated once and persisted to disk so it survives
simulator restarts — exactly like the NVS key on the ESP32.

Environment variables (all have defaults):
  BACKEND_URL          http://backend:3000
  DEVICE_ID            esp32-001-sim
  ENTROPY_INTERVAL_MS  10000
  HTTP_TIMEOUT_S       10
"""

import os
import signal
import sys
import time
import hashlib
import secrets
import logging

import requests
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [firmware_sim] %(levelname)s %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%SZ',
)
log = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────
BACKEND_URL       = os.environ.get('BACKEND_URL',              'http://backend:3000')
DEVICE_ID         = os.environ.get('DEVICE_ID',                'esp32-001-sim')
INTERVAL_MS       = int(os.environ.get('ENTROPY_INTERVAL_MS',  '10000'))
HTTP_TIMEOUT_S    = int(os.environ.get('HTTP_TIMEOUT_S',        '10'))

ECDSA_KEY_FILE    = '/tmp/enigma_sim_key.pem'
AES_KEY_FILE      = '/tmp/enigma_sim_aes_key.bin'

# IST = UTC + 5 h 30 min
IST_OFFSET_SECS   = 5 * 3600 + 30 * 60

ENTROPY_ENDPOINT       = f"{BACKEND_URL}/api/v1/entropy"
DEVICE_STATUS_ENDPOINT = f"{BACKEND_URL}/api/v1/system/device-status"

# ── Retry on startup ────────────────────────────────────────────────────────
STARTUP_RETRY_S   = 5
STARTUP_TIMEOUT_S = 120


# ══════════════════════════════════════════════════════════════════════════
#  Key management – mirror ESP32 NVS persistence
# ══════════════════════════════════════════════════════════════════════════

def load_or_generate_key() -> ec.EllipticCurvePrivateKey:
    """Load the ECDSA keypair from disk or generate a new one."""
    if os.path.exists(ECDSA_KEY_FILE):
        log.info("Reusing existing ECDSA keypair from %s", ECDSA_KEY_FILE)
        with open(ECDSA_KEY_FILE, 'rb') as f:
            return serialization.load_pem_private_key(f.read(), password=None)

    log.info("Generating new secp256r1 (P-256) keypair …")
    key = ec.generate_private_key(ec.SECP256R1())
    with open(ECDSA_KEY_FILE, 'wb') as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ))
    log.info("ECDSA keypair saved to %s", ECDSA_KEY_FILE)
    return key


def load_or_generate_aes_key() -> bytes:
    """Load the 32-byte AES-256 key from disk or generate a persistent one."""
    if os.path.exists(AES_KEY_FILE):
        with open(AES_KEY_FILE, 'rb') as f:
            key = f.read()
        if len(key) == 32:
            log.info("Reusing existing AES-256 key from %s", AES_KEY_FILE)
            return key

    log.info("Generating new AES-256 key …")
    key = secrets.token_bytes(32)
    with open(AES_KEY_FILE, 'wb') as f:
        f.write(key)
    log.info("AES-256 key saved to %s", AES_KEY_FILE)
    return key


def pubkey_uncompressed_hex(key: ec.EllipticCurvePrivateKey) -> str:
    """Return 130-char hex of the uncompressed public key (04 || X || Y)."""
    raw = key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    assert len(raw) == 65 and raw[0] == 0x04, "Unexpected public key format"
    return raw.hex()


# ══════════════════════════════════════════════════════════════════════════
#  Enigma Pro crypto pipeline – mirrors Enigma_pro.c exactly
# ══════════════════════════════════════════════════════════════════════════

def aes_cbc_encrypt(key: bytes, iv: bytes, plaintext: bytes) -> bytes:
    """AES-256-CBC encrypt one 16-byte block.  iv is consumed (not modified)."""
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    enc = cipher.encryptor()
    return enc.update(plaintext) + enc.finalize()


def ist_datetime_str(utc_epoch: int) -> str:
    """Return 'YYYY-MM-DD HH:MM:SS' in IST (UTC+5:30)."""
    ist_epoch = utc_epoch + IST_OFFSET_SECS
    t = time.gmtime(ist_epoch)
    return time.strftime('%Y-%m-%d %H:%M:%S', t)


def compute_hash_pro(aes_key: bytes, datetime_str: str) -> bytes:
    """
    SHA-256( AES_key[32] ‖ IST_datetime_str )
    Mirrors sha256_key_datetime() in Enigma_pro.c exactly.
    """
    return hashlib.sha256(aes_key + datetime_str.encode()).digest()


def ecdsa_sign_raw(key: ec.EllipticCurvePrivateKey, hash_bytes: bytes) -> bytes:
    """
    Sign hash_bytes using ECDSA/SHA-256.

    The backend verifier does:
        crypto.createVerify('SHA256').update(hashBuf).verify(pubkey, derSig)

    which applies SHA-256 to hashBuf internally before the ECDSA check.
    We use ec.ECDSA(hashes.SHA256()) so the library hashes hash_bytes with
    SHA-256 before signing — producing a signature that the Node verifier
    accepts.  The ESP32 firmware mirrors this by applying an extra SHA-256
    pass inside sign_hash() before calling mbedtls_ecdsa_sign().

    Returns: raw 64-byte signature (r || s, each 32 bytes big-endian)
    """
    der_sig = key.sign(hash_bytes, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der_sig)
    return r.to_bytes(32, 'big') + s.to_bytes(32, 'big')


# ══════════════════════════════════════════════════════════════════════════
#  Backend readiness probe
# ══════════════════════════════════════════════════════════════════════════

def wait_for_backend() -> None:
    """Poll /health until the backend responds or STARTUP_TIMEOUT_S elapses."""
    health_url = f"{BACKEND_URL}/health"
    deadline = time.monotonic() + STARTUP_TIMEOUT_S
    log.info("Waiting for backend at %s …", health_url)

    while time.monotonic() < deadline:
        try:
            r = requests.get(health_url, timeout=3)
            if r.status_code < 500:
                log.info("Backend is ready (HTTP %d)", r.status_code)
                return
        except requests.exceptions.RequestException:
            pass
        log.info("  → not ready yet, retrying in %ds …", STARTUP_RETRY_S)
        time.sleep(STARTUP_RETRY_S)

    raise RuntimeError(f"Backend did not become ready within {STARTUP_TIMEOUT_S}s")


def send_device_status(online: bool, rtc_time: str | None = None) -> None:
    """
    POST /api/v1/system/device-status so the backend immediately broadcasts
    the correct online/offline state to all WebSocket clients.
    """
    payload: dict = {
        'device_id': DEVICE_ID,
        'online':    online,
        'com_port':  'DOCKER-SIM',
    }
    if rtc_time:
        payload['rtc_time'] = rtc_time
    try:
        r = requests.post(DEVICE_STATUS_ENDPOINT, json=payload, timeout=HTTP_TIMEOUT_S)
        log.info("device-status → online=%s  HTTP %d", online, r.status_code)
    except requests.exceptions.RequestException as exc:
        log.warning("Could not send device-status signal: %s", exc)


# ══════════════════════════════════════════════════════════════════════════
#  Main entropy loop  –  Enigma Pro pipeline
# ══════════════════════════════════════════════════════════════════════════

def main() -> None:
    log.info("╔══════════════════════════════════════════════════════════════╗")
    log.info("║       ENIGMA Pro Firmware Simulator (COM7 / ESP32)           ║")
    log.info("╚══════════════════════════════════════════════════════════════╝")
    log.info("  device    : %s", DEVICE_ID)
    log.info("  endpoint  : %s", ENTROPY_ENDPOINT)
    log.info("  interval  : %d ms", INTERVAL_MS)
    log.info("  pipeline  : AES-256-CBC → SHA-256(key‖datetime) → ECDSA")

    wait_for_backend()

    ecdsa_key   = load_or_generate_key()
    aes_key     = load_or_generate_aes_key()
    pubkey_hex  = pubkey_uncompressed_hex(ecdsa_key)
    pubkey_sent = False

    log.info("ECDSA public key (first 20 chars): %s…", pubkey_hex[:20])
    log.info("AES-256 key     (first 8 chars) : %s…", aes_key.hex()[:8])

    # ── Signal online as soon as the backend is ready ────────────────────
    send_device_status(online=True)

    # ── Graceful shutdown: mark offline on SIGTERM / SIGINT ──────────────
    def _shutdown(signum, frame):   # noqa: ARG001
        log.info("Shutdown signal received – marking device offline …")
        send_device_status(online=False)
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    was_connected = True   # track connection loss so we can re-announce on restore

    try:
        while True:
            cycle_start = time.monotonic()

            try:
                # ── 1. Unix timestamp ────────────────────────────────────────
                timestamp = int(time.time())

                # ── 2. IST datetime string  "YYYY-MM-DD HH:MM:SS" ────────────
                ist_datetime = ist_datetime_str(timestamp)
                rtc_time     = ist_datetime[11:]          # "HH:MM:SS" portion

                # ── 3. 16-byte random plaintext + fresh IV ────────────────────
                plain = secrets.token_bytes(16)
                iv    = secrets.token_bytes(16)

                # ── 4. AES-256-CBC encrypt ────────────────────────────────────
                cipher_bytes = aes_cbc_encrypt(aes_key, iv, plain)

                # ── 5. SHA-256(AES_key ‖ IST_datetime_str)  →  entropy_hash ──
                hash_bytes = compute_hash_pro(aes_key, ist_datetime)
                hash_hex   = hash_bytes.hex()

                # ── 6. ECDSA sign (ECDSA/SHA-256 to match Node verifier) ──────
                sig_raw = ecdsa_sign_raw(ecdsa_key, hash_bytes)
                sig_hex = sig_raw.hex()

                # ── 7. Build payload ──────────────────────────────────────────
                payload: dict = {
                    'device_id':      DEVICE_ID,
                    'timestamp':      timestamp,
                    'entropy_hash':   hash_hex,
                    'signature':      sig_hex,
                    'rtc_time':       rtc_time,
                    'aes_ciphertext': cipher_bytes.hex(),
                    'aes_iv':         iv.hex(),
                }
                if not pubkey_sent:
                    payload['public_key'] = pubkey_hex

                # ── 8. Serial-monitor style pretty-print ──────────────────────
                log.info("╔══ ENIGMA Entropy Emission ══╗")
                log.info("  IST DateTime : %s", ist_datetime)
                log.info("  RTC (IST)    : %s", rtc_time)
                log.info("  UNIX Epoch   : %d", timestamp)
                log.info("  AES IV       : %s", iv.hex())
                log.info("  AES Cipher   : %s", cipher_bytes.hex())
                log.info("  SHA-256 Hash : %s…", hash_hex[:32])
                log.info("  ECDSA Sig    : %s…", sig_hex[:32])

                # ── 9. POST to backend ────────────────────────────────────────
                # If we just recovered from a connection error, re-announce
                # online BEFORE posting so the TRNG pipeline is active first.
                if not was_connected:
                    log.info("Reconnected — re-announcing online status …")
                    send_device_status(online=True, rtc_time=rtc_time)
                    was_connected = True

                resp = requests.post(
                    ENTROPY_ENDPOINT, json=payload, timeout=HTTP_TIMEOUT_S,
                )

                if resp.status_code == 201:
                    record_id = resp.json().get('data', {}).get('id', '?')
                    log.info(
                        "✓  id=%-4s  hash=%.16s…  rtc=%s  [Accepted – blockchain anchor queued]",
                        record_id, hash_hex, rtc_time,
                    )
                    pubkey_sent = True

                elif resp.status_code == 409:
                    log.warning("⚠  Replay detected (HTTP 409), skipping record")

                else:
                    log.warning("✗  HTTP %d: %s", resp.status_code, resp.text[:300])

            except requests.exceptions.ConnectionError:
                log.warning("Connection refused – backend unreachable, will retry")
                pubkey_sent = False   # re-send pubkey after reconnect
                was_connected = False

            except Exception as exc:  # noqa: BLE001
                log.error("Cycle error: %s", exc, exc_info=True)

            # ── Sleep for remainder of interval ──────────────────────────────
            elapsed_ms = (time.monotonic() - cycle_start) * 1000.0
            sleep_s    = max(0.0, (INTERVAL_MS - elapsed_ms) / 1000.0)
            time.sleep(sleep_s)

    finally:
        # Ensure the backend always receives an offline signal on exit
        send_device_status(online=False)


if __name__ == '__main__':
    main()
