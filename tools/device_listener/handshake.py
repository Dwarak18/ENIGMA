"""
ENIGMA Serial Handshake Protocol
─────────────────────────────────────────────────────────────────────────────
Verifies a USB-serial device is a genuine ENIGMA unit (ESP32-S3 + ATECC608A)
by performing a three-step serial exchange:

  Step 1 — Discover
    Listener → Device:  "ENIGMA:DISCOVER\\n"
    Device   → Listener: "ENIGMA:HELLO:<device_id>:<pubkey_hex>[:<rtc_time>]\\n"
      pubkey_hex = 130-char hex of uncompressed P-256 public key (04 || X || Y)
      rtc_time   = optional "HH:MM:SS" IST  (omitted when no RTC locked)

  Step 2 — Challenge  (ATECC608A prove-possession)
    Listener → Device:  "ENIGMA:CHALLENGE:<32_bytes_hex>\\n"
    Device   → Listener: "ENIGMA:SIGN:<64_bytes_hex>\\n"
      64-byte raw r||s ECDSA-P256/SHA-256 signature produced by ATECC608A

  Step 3 — Acknowledge
    Listener → Device:  "ENIGMA:OK\\n"   (passed)
                   or:  "ENIGMA:FAIL\\n" (failed)

The ECDSA verification mirrors verifier.js exactly:
    crypto.createVerify('SHA256').update(challengeBuffer).verify(pubkeyHex, derSig)
so we use ec.ECDSA(hashes.SHA256()) on the Python side.
"""
import re
import secrets
import logging
from dataclasses import dataclass
from typing import Optional

import serial
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidSignature

log = logging.getLogger(__name__)


@dataclass
class HandshakeResult:
    verified:   bool
    device_id:  Optional[str] = None
    pubkey_hex: Optional[str] = None
    rtc_time:   Optional[str] = None


def perform_handshake(
    port: str,
    baud_rate: int = 115200,
    timeout_s: float = 5.0,
) -> HandshakeResult:
    """
    Open the serial port, execute the three-step ENIGMA handshake, and return
    a HandshakeResult.  Raises serial.SerialException if the port cannot be opened.
    """
    log.info("Opening %s @ %d baud for handshake (timeout=%.1fs)…", port, baud_rate, timeout_s)

    with serial.Serial(port, baud_rate, timeout=timeout_s) as ser:
        ser.reset_input_buffer()

        # ── Step 1: Discover ────────────────────────────────────────────────
        ser.write(b'ENIGMA:DISCOVER\n')
        raw = ser.readline()
        if not raw:
            log.warning("No response to DISCOVER on %s", port)
            return HandshakeResult(verified=False)

        line = raw.decode(errors='replace').strip()
        log.debug("DISCOVER response: %s", line)

        # "ENIGMA:HELLO:<device_id>:<130-char-pubkey>[:<HH:MM:SS>]"
        m = re.match(
            r'^ENIGMA:HELLO:([^:]+):([0-9a-fA-F]{130})(?::(\d{2}:\d{2}:\d{2}))?$',
            line,
        )
        if not m:
            log.warning("Unexpected DISCOVER response on %s: %s", port, line[:100])
            return HandshakeResult(verified=False)

        device_id  = m.group(1)
        pubkey_hex = m.group(2)
        rtc_time   = m.group(3)
        log.info("Device: id=%-20s  pubkey=%.20s…  rtc=%s", device_id, pubkey_hex, rtc_time or '—')

        # ── Step 2: Challenge ───────────────────────────────────────────────
        challenge = secrets.token_bytes(32)
        ser.write(f'ENIGMA:CHALLENGE:{challenge.hex()}\n'.encode())
        raw = ser.readline()

        if not raw:
            log.warning("No response to CHALLENGE on %s", port)
            ser.write(b'ENIGMA:FAIL\n')
            return HandshakeResult(
                verified=False, device_id=device_id, pubkey_hex=pubkey_hex, rtc_time=rtc_time,
            )

        line = raw.decode(errors='replace').strip()
        log.debug("CHALLENGE response: %s", line[:100])

        # "ENIGMA:SIGN:<128-char hex r||s>"
        m2 = re.match(r'^ENIGMA:SIGN:([0-9a-fA-F]{128})$', line)
        if not m2:
            log.warning("Bad SIGN response on %s: %s", port, line[:100])
            ser.write(b'ENIGMA:FAIL\n')
            return HandshakeResult(
                verified=False, device_id=device_id, pubkey_hex=pubkey_hex, rtc_time=rtc_time,
            )

        sig_hex = m2.group(1)

        # ── Step 3: Verify & acknowledge ────────────────────────────────────
        ok = _verify_ecdsa(pubkey_hex, challenge, sig_hex)
        ser.write(b'ENIGMA:OK\n' if ok else b'ENIGMA:FAIL\n')

        if ok:
            log.info("✓ ATECC608A challenge-response passed for %s", device_id)
        else:
            log.warning("✗ ATECC608A challenge-response FAILED for %s", device_id)

        return HandshakeResult(
            verified=ok, device_id=device_id, pubkey_hex=pubkey_hex, rtc_time=rtc_time,
        )


def _verify_ecdsa(pubkey_hex: str, challenge: bytes, sig_hex: str) -> bool:
    """
    Verify ECDSA-P256/SHA-256.
    sig_hex is 128 hex chars: r (32 B) || s (32 B), big-endian.
    Mirrors the Node.js verifier.js logic exactly.
    """
    try:
        pubkey_bytes = bytes.fromhex(pubkey_hex)
        if len(pubkey_bytes) != 65 or pubkey_bytes[0] != 0x04:
            log.warning("Bad public key format (len=%d prefix=%02x)", len(pubkey_bytes), pubkey_bytes[0])
            return False

        public_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), pubkey_bytes)

        sig_bytes = bytes.fromhex(sig_hex)
        if len(sig_bytes) != 64:
            return False

        r   = int.from_bytes(sig_bytes[:32], 'big')
        s   = int.from_bytes(sig_bytes[32:], 'big')
        der = encode_dss_signature(r, s)

        public_key.verify(der, challenge, ec.ECDSA(hashes.SHA256()))
        return True

    except InvalidSignature:
        return False
    except Exception as exc:
        log.error("ECDSA verification error: %s", exc)
        return False
