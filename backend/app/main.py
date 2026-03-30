"""Main FastAPI application for ENIGMA entropy backend."""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime
import time
from uuid import UUID

from app.config import get_settings
from app.database import get_db, init_db
from app.models import Device, EntropyRecord
from app.schemas import (
    DeviceCreate,
    DeviceResponse,
    CaptureRequest,
    EntropyRecordResponse,
    VerificationRequest,
    VerificationResponse,
)
from app.services.image_processing import process_image
from app.services.crypto import (
    derive_key,
    encrypt_data,
    generate_integrity_hash,
    generate_entropy_hash,
)

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    init_db()
    print(f"✓ {settings.APP_NAME} started")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": settings.APP_NAME,
    }


# ============================================================================
# DEVICE ENDPOINTS
# ============================================================================


@app.post("/devices", response_model=DeviceResponse)
async def register_device(
    device: DeviceCreate,
    db: Session = Depends(get_db),
):
    """
    Register a new ENIGMA device.

    Args:
        device: Device registration data (device_id, public_key)

    Returns:
        DeviceResponse with registration details
    """
    # Check if device already exists
    existing = db.query(Device).filter(Device.device_id == device.device_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Device {device.device_id} already registered",
        )

    # Create new device
    new_device = Device(
        device_id=device.device_id,
        public_key=device.public_key,
        first_seen=datetime.utcnow(),
        last_seen=datetime.utcnow(),
    )

    db.add(new_device)
    db.commit()
    db.refresh(new_device)

    return new_device


@app.get("/devices/{device_id}", response_model=DeviceResponse)
async def get_device(device_id: str, db: Session = Depends(get_db)):
    """Get device information."""
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


# ============================================================================
# ENTROPY CAPTURE & PROCESSING
# ============================================================================


@app.post("/capture", response_model=EntropyRecordResponse)
async def capture_entropy(
    request: CaptureRequest,
    db: Session = Depends(get_db),
):
    """
    Capture image and process entropy through full pipeline.

    Pipeline:
    1. Decode base64 image
    2. Convert to grayscale
    3. Extract bitstream (LSB method)
    4. Condition entropy (SHA-256)
    5. Derive key from device_id + timestamp + server_seed
    6. Encrypt conditioned entropy
    7. Generate integrity hash
    8. Store in database

    Args:
        request: CaptureRequest with base64 image and device_id

    Returns:
        EntropyRecordResponse with record ID and hashes
    """
    # Verify device exists
    device = (
        db.query(Device)
        .filter(Device.device_id == request.device_id)
        .first()
    )
    if not device:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Device {request.device_id} not registered",
        )

    try:
        # Get current timestamp
        timestamp = int(time.time())

        # Process image: extract and condition entropy
        conditioned_entropy, raw_bitstream, bitstream_hash = process_image(request.image)

        # Derive encryption key
        aes_key = derive_key(request.device_id, timestamp)

        # Encrypt conditioned entropy
        encrypted_entropy_hex, iv_hex = encrypt_data(conditioned_entropy, aes_key)

        # Generate entropy hash
        entropy_hash = generate_entropy_hash(
            conditioned_entropy,
            timestamp,
            request.device_id,
        )

        # Get previous hash for chaining
        last_record = (
            db.query(EntropyRecord)
            .filter(EntropyRecord.device_id == request.device_id)
            .order_by(EntropyRecord.created_at.desc())
            .first()
        )
        previous_hash = last_record.integrity_hash if last_record else None

        # Generate integrity hash (with chaining)
        integrity_hash = generate_integrity_hash(
            encrypted_entropy_hex,
            timestamp,
            aes_key,
            previous_hash,
        )

        # Create database record
        record = EntropyRecord(
            device_id=request.device_id,
            timestamp=timestamp,
            entropy_hash=entropy_hash,
            integrity_hash=integrity_hash,
            aes_ciphertext=encrypted_entropy_hex,
            aes_iv=iv_hex,
            image_bits=bitstream_hash,
            image_hash=bitstream_hash,
            previous_hash=previous_hash,
        )

        db.add(record)
        db.commit()
        db.refresh(record)

        # Update device last_seen
        device.last_seen = datetime.utcnow()
        db.commit()

        return record

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Processing error: {str(e)}",
        )


# ============================================================================
# RECORDS & VERIFICATION
# ============================================================================


@app.get("/records", response_model=list[EntropyRecordResponse])
async def get_all_records(
    device_id: str = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    Get entropy records, optionally filtered by device.

    Args:
        device_id: Optional device filter
        limit: Maximum number of records (default 100)

    Returns:
        List of EntropyRecordResponse
    """
    query = db.query(EntropyRecord)

    if device_id:
        query = query.filter(EntropyRecord.device_id == device_id)

    records = query.order_by(EntropyRecord.created_at.desc()).limit(limit).all()
    return records


@app.get("/records/{record_id}", response_model=EntropyRecordResponse)
async def get_record(record_id: UUID, db: Session = Depends(get_db)):
    """Get a specific entropy record."""
    record = db.query(EntropyRecord).filter(EntropyRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@app.post("/verify/{record_id}", response_model=VerificationResponse)
async def verify_record(
    record_id: UUID,
    db: Session = Depends(get_db),
):
    """
    Verify integrity of an entropy record.

    Recomputes hash and compares with stored value to detect tampering.

    Args:
        record_id: Record to verify

    Returns:
        VerificationResponse with verification result
    """
    record = db.query(EntropyRecord).filter(EntropyRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    try:
        # Derive key from stored device_id and timestamp
        aes_key = derive_key(record.device_id, record.timestamp)

        # Recompute integrity hash
        computed_hash = generate_integrity_hash(
            record.aes_ciphertext,
            record.timestamp,
            aes_key,
            record.previous_hash,
        )

        # Compare with stored hash
        is_valid = computed_hash == record.integrity_hash

        return VerificationResponse(
            record_id=record.id,
            is_valid=is_valid,
            timestamp=record.timestamp,
            entropy_hash=record.entropy_hash,
            integrity_hash=record.integrity_hash,
            computed_hash=computed_hash,
            message="Integrity verified" if is_valid else "Integrity violation detected",
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Verification error: {str(e)}",
        )


# ============================================================================
# STATISTICS & MONITORING
# ============================================================================


@app.get("/statistics")
async def get_statistics(db: Session = Depends(get_db)):
    """Get system statistics."""
    total_devices = db.query(Device).count()
    total_records = db.query(EntropyRecord).count()

    device_counts = (
        db.query(EntropyRecord.device_id, "count")
        .group_by(EntropyRecord.device_id)
        .all()
    )

    return {
        "total_devices": total_devices,
        "total_entropy_records": total_records,
        "devices_by_count": [
            {"device_id": dc[0], "record_count": db.query(EntropyRecord).filter(
                EntropyRecord.device_id == dc[0]
            ).count()}
            for dc in device_counts
        ],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
    )
