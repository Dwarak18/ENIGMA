"""SQLAlchemy ORM models for ENIGMA database."""

from sqlalchemy import Column, String, Text, LargeBinary, DateTime, BigInteger, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


class Device(Base):
    """Registered ENIGMA edge device."""

    __tablename__ = "devices"

    device_id = Column(String, primary_key=True, index=True)
    public_key = Column(String, nullable=False)
    first_seen = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    entropy_records = relationship("EntropyRecord", back_populates="device")

    def __repr__(self):
        return f"<Device {self.device_id}>"


class EntropyRecord(Base):
    """Validated entropy submission with full cryptographic chain."""

    __tablename__ = "entropy_records"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    device_id = Column(String, ForeignKey("devices.device_id"), nullable=False, index=True)
    timestamp = Column(BigInteger, nullable=False)  # UNIX epoch seconds
    entropy_hash = Column(String(64), nullable=False)  # SHA-256 hex
    signature = Column(String(128), nullable=False)  # ECDSA r||s hex
    aes_ciphertext = Column(String, nullable=True)  # AES-256-CBC hex
    aes_iv = Column(String(32), nullable=True)  # AES IV hex
    rtc_time = Column(String, nullable=True)  # "HH:MM:SS" IST
    image_bits = Column(String, nullable=True)  # Image bitstream hex
    image_encrypted = Column(String, nullable=True)  # Encrypted image hex
    image_iv = Column(String(32), nullable=True)  # Image AES IV hex
    image_hash = Column(String(64), nullable=True)  # SHA-256 of image hex
    integrity_hash = Column(String(64), nullable=False)  # SHA-256 hex for verification
    previous_hash = Column(String(64), nullable=True)  # Chain link
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    device = relationship("Device", back_populates="entropy_records")

    def __repr__(self):
        return f"<EntropyRecord {self.id}>"
