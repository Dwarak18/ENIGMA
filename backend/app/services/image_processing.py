"""Image processing and bitstream extraction for entropy."""

import base64
import cv2
import numpy as np
import hashlib
from typing import Tuple
from app.config import get_settings

settings = get_settings()


def base64_to_image(base64_string: str) -> np.ndarray:
    """
    Convert base64 string to OpenCV image.

    Args:
        base64_string: Base64-encoded image string

    Returns:
        NumPy array (OpenCV format)

    Raises:
        ValueError: If image is invalid or too large
    """
    # Validate size
    if len(base64_string) > settings.MAX_BASE64_IMAGE_SIZE:
        raise ValueError(f"Image too large: {len(base64_string)} > {settings.MAX_BASE64_IMAGE_SIZE}")

    try:
        # Decode base64
        image_data = base64.b64decode(base64_string)

        # Convert to NumPy array and decode
        nparr = np.frombuffer(image_data, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            raise ValueError("Failed to decode image")

        # Validate dimensions
        height, width = image.shape[:2]
        if height < settings.MIN_IMAGE_SIZE or width < settings.MIN_IMAGE_SIZE:
            raise ValueError(f"Image too small: {width}x{height}")
        if height > settings.MAX_IMAGE_SIZE or width > settings.MAX_IMAGE_SIZE:
            raise ValueError(f"Image too large: {width}x{height}")

        return image

    except Exception as e:
        raise ValueError(f"Invalid image data: {str(e)}")


def image_to_grayscale(image: np.ndarray) -> np.ndarray:
    """
    Convert image to grayscale.

    Args:
        image: OpenCV image (BGR or RGB)

    Returns:
        Grayscale image (8-bit)
    """
    if len(image.shape) == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image


def extract_bitstream_lsb(gray_image: np.ndarray) -> bytes:
    """
    Extract bitstream using Least Significant Bit (LSB) method.

    Method A: bit = pixel_value & 1

    Args:
        gray_image: Grayscale image

    Returns:
        Bitstream as bytes
    """
    # Flatten image to 1D
    pixels = gray_image.flatten()

    # Extract LSB from each pixel
    bits = [str(pixel & 1) for pixel in pixels]

    # Convert bits to bytes (8 bits per byte)
    bitstring = "".join(bits)

    # Pad to multiple of 8
    pad_length = (8 - len(bitstring) % 8) % 8
    bitstring += "0" * pad_length

    # Convert to bytes
    bitstream = bytes(int(bitstring[i : i + 8], 2) for i in range(0, len(bitstring), 8))

    return bitstream


def extract_bitstream_xor_neighbors(gray_image: np.ndarray) -> bytes:
    """
    Extract bitstream using XOR of neighboring pixels.

    Method B: bit[i] = pixel[i] XOR pixel[i+1]

    Args:
        gray_image: Grayscale image

    Returns:
        Bitstream as bytes
    """
    # Flatten image to 1D
    pixels = gray_image.flatten()

    # XOR adjacent pixels
    bits = []
    for i in range(len(pixels) - 1):
        bit = (pixels[i] ^ pixels[i + 1]) & 1
        bits.append(str(bit))

    # Convert bits to bytes
    bitstring = "".join(bits)

    # Pad to multiple of 8
    pad_length = (8 - len(bitstring) % 8) % 8
    bitstring += "0" * pad_length

    # Convert to bytes
    bitstream = bytes(int(bitstring[i : i + 8], 2) for i in range(0, len(bitstring), 8))

    return bitstream


def extract_bitstream(
    image: np.ndarray, method: str = "lsb"
) -> bytes:
    """
    Extract bitstream from image using specified method.

    Args:
        image: OpenCV image
        method: "lsb" (default) or "xor"

    Returns:
        Bitstream as bytes

    Raises:
        ValueError: If method is invalid
    """
    # Convert to grayscale
    gray = image_to_grayscale(image)

    if method == "lsb":
        return extract_bitstream_lsb(gray)
    elif method == "xor":
        return extract_bitstream_xor_neighbors(gray)
    else:
        raise ValueError(f"Unknown extraction method: {method}")


def condition_entropy(bitstream: bytes) -> bytes:
    """
    Apply entropy conditioning using SHA-256 hashing.

    Mandatory step: conditioned_data = SHA256(bitstream_bytes)

    Args:
        bitstream: Raw extracted bitstream

    Returns:
        Conditioned entropy (32 bytes)
    """
    conditioned = hashlib.sha256(bitstream).digest()
    return conditioned


def process_image(
    base64_image: str, method: str = "lsb"
) -> Tuple[bytes, bytes, str]:
    """
    Complete image processing pipeline:
    1. Decode base64
    2. Convert to grayscale
    3. Extract bitstream
    4. Condition entropy

    Args:
        base64_image: Base64-encoded image
        method: Bitstream extraction method ("lsb" or "xor")

    Returns:
        Tuple of (conditioned_entropy, raw_bitstream, bitstream_hash)
    """
    # Decode image
    image = base64_to_image(base64_image)

    # Extract bitstream
    bitstream = extract_bitstream(image, method)

    # Generate hash of raw bitstream
    bitstream_hash = hashlib.sha256(bitstream).hexdigest()

    # Condition entropy
    conditioned = condition_entropy(bitstream)

    return conditioned, bitstream, bitstream_hash
