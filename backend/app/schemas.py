"""Pydantic schemas for request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class DeviceCreate(BaseModel):
    """Schema for device registration."""

    device_id: str = Field(..., min_length=1, max_length=255)
    public_key: str = Field(..., min_length=130, max_length=130)  # secp256r1 uncompressed


class DeviceResponse(BaseModel):
    """Schema for device response."""

    device_id: str
    public_key: str
    first_seen: datetime
    last_seen: datetime

    class Config:
        from_attributes = True


class CaptureRequest(BaseModel):
    """Schema for image capture request."""

    image: str = Field(..., description="Base64-encoded image")
    device_id: str = Field(..., min_length=1, max_length=255)


class FirmwareEntropyRequest(BaseModel):
    """Schema for firmware/simulator entropy submission."""

    device_id: str = Field(..., min_length=1, max_length=255)
    timestamp: int
    entropy_hash: str = Field(..., min_length=64, max_length=64)
    signature: str = Field(..., min_length=128, max_length=128)
    rtc_time: Optional[str] = Field(default=None)
    aes_ciphertext: Optional[str] = None
    aes_iv: Optional[str] = None
    image_encrypted: Optional[str] = None
    image_iv: Optional[str] = None
    image_hash: Optional[str] = None
    public_key: Optional[str] = None


class EntropyRecordResponse(BaseModel):
    """Schema for entropy record response."""

    id: UUID
    device_id: str
    timestamp: int
    entropy_hash: str
    signature: Optional[str] = None
    integrity_hash: str
    aes_ciphertext: Optional[str] = None
    aes_iv: Optional[str] = None
    rtc_time: Optional[str] = None
    image_bits: Optional[str] = None
    image_encrypted: Optional[str] = None
    image_iv: Optional[str] = None
    image_hash: Optional[str] = None
    previous_hash: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class VerificationRequest(BaseModel):
    """Schema for entropy verification request."""

    record_id: UUID


class VerificationResponse(BaseModel):
    """Schema for verification result."""

    record_id: UUID
    is_valid: bool
    timestamp: int
    entropy_hash: str
    integrity_hash: str
    computed_hash: str
    message: str
