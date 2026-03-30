"""Cryptographic utilities for ENIGMA system."""

import hashlib
import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from Crypto.Cipher import AES
from typing import Tuple
from app.config import get_settings

settings = get_settings()


def derive_key(device_id: str, timestamp: int, server_seed: str = None) -> bytes:
    """
    Derive 128-bit AES key from device info, timestamp, and server seed.

    Key derivation:
        derived_key = SHA256(device_id + timestamp + server_random_seed)
        Use first 16 bytes for AES-128

    Args:
        device_id: Unique device identifier
        timestamp: UNIX epoch timestamp
        server_seed: Server's random seed (defaults to config)

    Returns:
        16-byte (128-bit) AES key
    """
    if server_seed is None:
        server_seed = settings.SERVER_RANDOM_SEED

    # Construct derivation input
    derivation_input = f"{device_id}{timestamp}{server_seed}".encode("utf-8")

    # Hash with SHA-256
    full_hash = hashlib.sha256(derivation_input).digest()

    # Use first 16 bytes for AES-128
    aes_key = full_hash[:16]

    return aes_key


def encrypt_data(data: bytes, aes_key: bytes) -> Tuple[str, str]:
    """
    Encrypt data using AES-128 in CTR mode.

    Args:
        data: Raw data to encrypt
        aes_key: 16-byte AES key

    Returns:
        Tuple of (ciphertext_hex, iv_hex)
    """
    # Generate random IV (16 bytes for AES)
    iv = os.urandom(16)

    # Create cipher in CTR mode
    cipher = Cipher(
        algorithms.AES(aes_key),
        modes.CTR(iv),
        backend=default_backend(),
    )
    encryptor = cipher.encryptor()

    # Encrypt
    ciphertext = encryptor.update(data) + encryptor.finalize()

    return ciphertext.hex(), iv.hex()


def decrypt_data(ciphertext_hex: str, iv_hex: str, aes_key: bytes) -> bytes:
    """
    Decrypt data using AES-128 in CTR mode.

    Args:
        ciphertext_hex: Hex-encoded ciphertext
        iv_hex: Hex-encoded IV
        aes_key: 16-byte AES key

    Returns:
        Decrypted data
    """
    ciphertext = bytes.fromhex(ciphertext_hex)
    iv = bytes.fromhex(iv_hex)

    cipher = Cipher(
        algorithms.AES(aes_key),
        modes.CTR(iv),
        backend=default_backend(),
    )
    decryptor = cipher.decryptor()

    plaintext = decryptor.update(ciphertext) + decryptor.finalize()

    return plaintext


def generate_integrity_hash(
    encrypted_data: str, timestamp: int, derived_key: bytes, previous_hash: str = None
) -> str:
    """
    Generate integrity hash for tamper detection.

    integrity_hash = SHA256(encrypted_data + timestamp + derived_key)

    For chaining (optional):
        current_hash = SHA256(current_data + previous_hash)

    Args:
        encrypted_data: Hex-encoded encrypted bitstream
        timestamp: UNIX epoch timestamp
        derived_key: 16-byte AES key (as bytes)
        previous_hash: Previous record's hash (for chaining)

    Returns:
        64-char hex SHA-256 hash
    """
    # Convert key to hex for hashing
    key_hex = derived_key.hex()

    # Construct integrity input
    if previous_hash:
        integrity_input = f"{encrypted_data}{timestamp}{key_hex}{previous_hash}".encode("utf-8")
    else:
        integrity_input = f"{encrypted_data}{timestamp}{key_hex}".encode("utf-8")

    # Generate SHA-256
    integrity_hash = hashlib.sha256(integrity_input).hexdigest()

    return integrity_hash


def generate_entropy_hash(data: bytes, timestamp: int, device_id: str) -> str:
    """
    Generate entropy hash for the bitstream.

    entropy_hash = SHA256(data + timestamp + device_id)

    Args:
        data: Bitstream data
        timestamp: UNIX epoch timestamp
        device_id: Device identifier

    Returns:
        64-char hex SHA-256 hash
    """
    entropy_input = data + str(timestamp).encode("utf-8") + device_id.encode("utf-8")
    entropy_hash = hashlib.sha256(entropy_input).hexdigest()

    return entropy_hash


def hash_object(*args) -> str:
    """
    Create a SHA-256 hash from multiple objects.

    Args:
        *args: Variable number of objects to hash

    Returns:
        64-char hex SHA-256 hash
    """
    hash_input = b""
    for arg in args:
        if isinstance(arg, bytes):
            hash_input += arg
        elif isinstance(arg, str):
            hash_input += arg.encode("utf-8")
        else:
            hash_input += str(arg).encode("utf-8")

    return hashlib.sha256(hash_input).hexdigest()
