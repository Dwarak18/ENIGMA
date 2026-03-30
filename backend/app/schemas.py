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


class EntropyRecordResponse(BaseModel):
    """Schema for entropy record response."""

    id: UUID
    device_id: str
    timestamp: int
    entropy_hash: str
    integrity_hash: str
    image_hash: Optional[str] = None
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
