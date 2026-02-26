#!/usr/bin/env python3
"""
ENIGMA Firmware Simulator
─────────────────────────
Runs inside the espressif/idf Docker image and reproduces exactly what the
ESP32 firmware does on every entropy cycle:

  1. Collect 64 bytes of OS-level random entropy
  2. Build timestamp (Unix epoch, seconds)
  3. Compute SHA-256(entropy || timestamp_8bytes_LE)  ← matches crypto_hash()
  4. Sign that digest with ECDSA/P-256               ← matches sign_hash()
     (Node.js createVerify('SHA256').update(digest) applies SHA-256 to the
      digest again; so we use ECDSA(SHA-256) here to produce a matching sig)
  5. POST JSON payload to backend /api/v1/entropy
  6. Sleep for ENTROPY_INTERVAL_MS, repeat forever

Environment variables (all have defaults):
  BACKEND_URL          http://backend:3000
  DEVICE_ID            esp32-001-sim
  ENTROPY_BYTES        64
  ENTROPY_INTERVAL_MS  10000
  HTTP_TIMEOUT_S       10
"""

import os
import time
import hashlib
import struct
import secrets
import logging
from datetime import datetime, timezone

import requests
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives import hashes, serialization

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [firmware_sim] %(levelname)s %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%SZ',
)
log = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────
BACKEND_URL       = os.environ.get('BACKEND_URL',         'http://backend:3000')
DEVICE_ID         = os.environ.get('DEVICE_ID',           'esp32-001-sim')
ENTROPY_BYTES     = int(os.environ.get('ENTROPY_BYTES',   '64'))
INTERVAL_MS       = int(os.environ.get('ENTROPY_INTERVAL_MS', '10000'))
HTTP_TIMEOUT_S    = int(os.environ.get('HTTP_TIMEOUT_S',  '10'))
KEY_FILE          = '/tmp/enigma_sim_key.pem'

ENTROPY_ENDPOINT  = f"{BACKEND_URL}/api/v1/entropy"

# ── Retry on startup ────────────────────────────────────────────────────────
STARTUP_RETRY_S   = 5    # seconds between backend health-check retries
STARTUP_TIMEOUT_S = 120  # give up after this long


# ══════════════════════════════════════════════════════════════════════════
#  Crypto helpers – mirror the C firmware exactly
# ══════════════════════════════════════════════════════════════════════════

def load_or_generate_key() -> ec.EllipticCurvePrivateKey:
    """Load the simulator's ECDSA keypair from disk or generate a new one."""
    if os.path.exists(KEY_FILE):
        log.info("Reusing existing keypair from %s", KEY_FILE)
        with open(KEY_FILE, 'rb') as f:
            return serialization.load_pem_private_key(f.read(), password=None)

    log.info("Generating new secp256r1 (P-256) keypair …")
    key = ec.generate_private_key(ec.SECP256R1())
    with open(KEY_FILE, 'wb') as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ))
    log.info("Keypair saved to %s", KEY_FILE)
    return key


def pubkey_uncompressed_hex(key: ec.EllipticCurvePrivateKey) -> str:
    """Return 130-char hex of the uncompressed public key (04 || X || Y)."""
    raw = key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    assert len(raw) == 65 and raw[0] == 0x04, "Unexpected public key format"
    return raw.hex()


def compute_hash(entropy: bytes, timestamp: int) -> bytes:
    """
    SHA-256(entropy_bytes || timestamp_8bytes_LE)
    Mirrors firmware crypto_hash() exactly.
    """
    ts_le = struct.pack('<Q', timestamp)   # 8-byte little-endian uint64
    return hashlib.sha256(entropy + ts_le).digest()


def ecdsa_sign_raw(key: ec.EllipticCurvePrivateKey, hash_bytes: bytes) -> bytes:
    """
    Sign hash_bytes using ECDSA/SHA-256.

    The backend verifier does:
        crypto.createVerify('SHA256').update(hashBuf).verify(pubkey, derSig)

    which applies SHA-256 to hashBuf internally before the ECDSA check.
    So we sign with ec.ECDSA(hashes.SHA256()) – the library hashes hash_bytes
    with SHA-256 before signing, matching what the Node verifier expects.

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


# ══════════════════════════════════════════════════════════════════════════
#  Main entropy loop
# ══════════════════════════════════════════════════════════════════════════

def main() -> None:
    log.info("╔══════════════════════════════════════════════════════════════╗")
    log.info("║       ENIGMA Firmware Simulator – ESP-IDF Docker Image       ║")
    log.info("╚══════════════════════════════════════════════════════════════╝")
    log.info("  device    : %s", DEVICE_ID)
    log.info("  endpoint  : %s", ENTROPY_ENDPOINT)
    log.info("  interval  : %d ms", INTERVAL_MS)
    log.info("  entropy   : %d bytes", ENTROPY_BYTES)

    wait_for_backend()

    key          = load_or_generate_key()
    pubkey_hex   = pubkey_uncompressed_hex(key)
    pubkey_sent  = False

    log.info("Public key (first 20 chars): %s…", pubkey_hex[:20])

    while True:
        cycle_start = time.monotonic()

        try:
            # ── 1. Entropy ──────────────────────────────────────────────
            entropy = secrets.token_bytes(ENTROPY_BYTES)

            # ── 2. Timestamp ────────────────────────────────────────────
            timestamp = int(time.time())

            # ── 3. Hash ─────────────────────────────────────────────────
            hash_bytes = compute_hash(entropy, timestamp)
            hash_hex   = hash_bytes.hex()

            # ── 4. Sign ─────────────────────────────────────────────────
            sig_raw  = ecdsa_sign_raw(key, hash_bytes)
            sig_hex  = sig_raw.hex()

            # ── 5. RTC time (use system clock as stand-in) ───────────────
            rtc_time = datetime.now(timezone.utc).strftime('%H:%M:%S')

            # ── 6. Payload ───────────────────────────────────────────────
            payload: dict = {
                'device_id':    DEVICE_ID,
                'timestamp':    timestamp,
                'entropy_hash': hash_hex,
                'signature':    sig_hex,
                'rtc_time':     rtc_time,
            }
            if not pubkey_sent:
                payload['public_key'] = pubkey_hex

            # ── 7. POST to backend ────────────────────────────────────────
            resp = requests.post(
                ENTROPY_ENDPOINT, json=payload, timeout=HTTP_TIMEOUT_S
            )

            if resp.status_code == 201:
                record_id = resp.json().get('data', {}).get('id', '?')
                log.info(
                    "✓  id=%-4s  hash=%.16s…  ts=%d  rtc=%s",
                    record_id, hash_hex, timestamp, rtc_time,
                )
                pubkey_sent = True

            elif resp.status_code == 409:
                # Replay – can happen if clocks collide on rapid restart
                log.warning("⚠  Replay detected (HTTP 409), skipping record")

            else:
                log.warning(
                    "✗  HTTP %d: %s",
                    resp.status_code, resp.text[:300],
                )

        except requests.exceptions.ConnectionError:
            log.warning("Connection refused – backend unreachable, will retry")
            pubkey_sent = False  # re-send pubkey after reconnect

        except Exception as exc:  # noqa: BLE001
            log.error("Cycle error: %s", exc, exc_info=True)

        # ── Sleep for remainder of interval ─────────────────────────────
        elapsed_ms = (time.monotonic() - cycle_start) * 1000.0
        sleep_s    = max(0.0, (INTERVAL_MS - elapsed_ms) / 1000.0)
        time.sleep(sleep_s)


if __name__ == '__main__':
    main()
