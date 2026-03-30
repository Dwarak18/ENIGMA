# ENIGMA IoT Architecture Guide - ESP32 → Backend → Database

**Objective:** Secure IoT pipeline where ESP32 captures image-derived entropy, processes locally, encrypts data, and backend validates + stores.

---

## 🎯 Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY: ESP32 (Crypto Generation)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. CAPTURE: Camera frame (160×120 grayscale)                   │
│     • Resolution: 160×120 = 19,200 pixels                       │
│     • Format: 8-bit grayscale                                   │
│     • Time: 50-100ms                                            │
│                                                                   │
│  2. EXTRACT: Bitstream (LSB method)                             │
│     • For each pixel: bit = pixel_value & 0x01                  │
│     • Output: 19,200 bits = 2,400 bytes                         │
│     • Options: 64-bit, 128-bit, or full bitstream               │
│     • Time: 20-50ms                                             │
│                                                                   │
│  3. CONDITION: SHA-256 hashing                                  │
│     • conditioned = SHA256(bitstream_bytes)                     │
│     • Output: 32 bytes (256 bits)                               │
│     • Removes bias, compresses to fixed size                    │
│     • Time: 5-15ms                                              │
│                                                                   │
│  4. DERIVE KEY: Device-bound key generation                     │
│     • Input: device_id + timestamp + hardware_seed              │
│     • derived_full = SHA256(concatenation)                      │
│     • aes_key = derived_full[0:16]  (first 16 bytes)           │
│     • NEVER transmit this key!                                  │
│     • Time: 5-10ms                                              │
│                                                                   │
│  5. ENCRYPT: AES-128-CTR mode                                   │
│     • Key: 128-bit derived key                                  │
│     • IV: 128-bit random nonce                                  │
│     • Input: conditioned_data (32 bytes OR full bitstream)      │
│     • Output: encrypted_data (same length as input)             │
│     • Time: 10-30ms                                             │
│                                                                   │
│  6. HASH: Integrity binding                                     │
│     • input = encrypted_data + device_id + timestamp            │
│     • integrity_hash = SHA256(input)                            │
│     • Time: 5-10ms                                              │
│                                                                   │
│  PACKAGE: JSON payload (NEVER includes key)                     │
│  {                                                              │
│    "device_id": "esp32-001",                                   │
│    "timestamp": 1700000000,                                    │
│    "encrypted_data": "hex(192 chars for 128-bit encrypted)",   │
│    "iv": "hex(32 chars for random IV)",                        │
│    "integrity_hash": "hex(64 chars)",                          │
│    "image_hash": "hex(64 chars of original bitstream)"         │
│  }                                                              │
│                                                                   │
│  TOTAL TIME: ~300ms (entire crypto pipeline)                   │
│  PAYLOAD SIZE: ~500 bytes                                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTPS
        ┌─────────────────────────────────────────────┐
        │  Backend Validation                          │
        │  (Trust but verify)                          │
        ├─────────────────────────────────────────────┤
        │                                              │
        │  1. Parse & validate schema (Pydantic)      │
        │  2. Recompute integrity hash:               │
        │     computed = SHA256(encrypted +           │
        │                device_id + timestamp)       │
        │  3. Compare: computed == incoming?          │
        │     IF YES → Store in DB                    │
        │     IF NO  → Reject (tampering)             │
        │  4. DO NOT decrypt                          │
        │  5. DO NOT regenerate keys                  │
        │                                              │
        │  TIME: ~50-100ms                            │
        │                                              │
        └─────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────────────┐
        │  PostgreSQL (Immutable Ledger)              │
        │                                              │
        │  entropy_records {                          │
        │    id         → UUID (primary key)          │
        │    device_id  → "esp32-001"                │
        │    timestamp  → 1700000000 (UNIX epoch)    │
        │    encrypted_data → BYTEA (binary)         │
        │    iv        → "a3f1..." (hex, 32 chars)   │
        │    integrity_hash → "x9y8..." (hex, 64)    │
        │    image_hash → "sha..." (hex, 64)         │
        │    previous_hash → NULL or "prev_hash"     │
        │    created_at → NOW() (server time)        │
        │  }                                          │
        │                                              │
        │  IMMUTABLE: Records never modified          │
        │  CHAINED: previous_hash links to prior     │
        │  INDEXED: Fast verification queries        │
        │                                              │
        │  TIME: 50-150ms (insert + index update)    │
        │                                              │
        └─────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────────────┐
        │  Frontend Dashboard (React)                  │
        │                                              │
        │  1. List records: GET /records              │
        │  2. Fetch details: GET /records/{id}       │
        │  3. Verify: POST /verify/{id}              │
        │     • Backend recomputes hash               │
        │     • Compares with stored value            │
        │     • Returns: { is_valid: true/false }    │
        │  4. Display:                                │
        │     • ✅ Hash match = authentic             │
        │     • ⚠️  Mismatch = tampering!             │
        │                                              │
        │  VISUALIZATION: Real-time integrity UI     │
        │                                              │
        └─────────────────────────────────────────────┘
```

---

## 🗄️ Database Design Rationale

### Why PostgreSQL?

| Criterion | SQLite | PostgreSQL | MongoDB |
|-----------|--------|-----------|---------|
| **Integrity Enforcement** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ |
| **ACID Compliance** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ |
| **Schema Strictness** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ |
| **Query Performance** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Hash Chain Support** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Binary Data (BYTEA)** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Indexing** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Multi-User** | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Scaling** | ⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

**Verdict:** PostgreSQL is the ONLY choice for integrity-critical systems.

---

## 📋 Complete Schema

```sql
-- Schema: ENIGMA IoT
-- Purpose: Tamper-evident entropy record storage
-- Database: PostgreSQL 15+

-- ─────────────────────────────────────────────────────
-- TABLE: devices
-- Purpose: Register and track IoT edge devices
-- ─────────────────────────────────────────────────────
CREATE TABLE devices (
    device_id TEXT PRIMARY KEY,
    public_key TEXT,                    -- Optional: secp256r1 key for ECDSA
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'         -- Device info, firmware version, etc.
);

-- ─────────────────────────────────────────────────────
-- TABLE: entropy_records
-- Purpose: Store encrypted entropy with integrity chain
-- ─────────────────────────────────────────────────────
CREATE TABLE entropy_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tracking & Binding
    device_id TEXT NOT NULL REFERENCES devices(device_id),
    timestamp BIGINT NOT NULL,            -- UNIX epoch seconds (from device)
    
    -- Cryptographic Data
    encrypted_data BYTEA NOT NULL,        -- AES-128-CTR ciphertext
    iv TEXT NOT NULL,                     -- Random IV (hex 32 chars = 16 bytes)
    
    -- Verification & Integrity
    integrity_hash TEXT NOT NULL,         -- SHA256(encrypted + timestamp + device_id)
    image_hash TEXT NOT NULL,             -- SHA256 of original bitstream
    
    -- Chain Linkage
    previous_hash TEXT,                   -- Reference to prior record's integrity_hash
    
    -- Server-Side Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(), -- Server timestamp for ordering
    
    -- Optional
    notes TEXT,                           -- Comments or flags
    verified_at TIMESTAMPTZ               -- When last verified
);

-- ─────────────────────────────────────────────────────
-- CRITICAL INDEXES (for verification performance)
-- ─────────────────────────────────────────────────────

-- Index 1: Device + timestamp (for recent records query)
CREATE INDEX idx_entropy_device_timestamp 
    ON entropy_records(device_id, created_at DESC);

-- Index 2: Integrity hash (for verification lookups)
CREATE INDEX idx_entropy_integrity_hash 
    ON entropy_records(integrity_hash);

-- Index 3: Chain linkage (for hash chain traversal)
CREATE INDEX idx_entropy_previous_hash 
    ON entropy_records(previous_hash);

-- Index 4: Time-based queries
CREATE INDEX idx_entropy_created_at 
    ON entropy_records(created_at DESC);

-- ─────────────────────────────────────────────────────
-- CONSTRAINTS
-- ─────────────────────────────────────────────────────

-- Prevent NULL integrity hashes
ALTER TABLE entropy_records 
    ADD CONSTRAINT non_null_integrity_hash 
    CHECK (integrity_hash IS NOT NULL);

-- Ensure timestamps are reasonable (after 2020-01-01)
ALTER TABLE entropy_records 
    ADD CONSTRAINT valid_timestamp 
    CHECK (timestamp > 1577836800);

-- ─────────────────────────────────────────────────────
-- SAMPLE DATA
-- ─────────────────────────────────────────────────────

INSERT INTO devices (device_id, public_key) VALUES
    ('esp32-001', '04...(130 hex chars)');

INSERT INTO entropy_records (
    device_id, timestamp, encrypted_data, iv, 
    integrity_hash, image_hash, previous_hash
) VALUES
    ('esp32-001', 1700000000, 
     E'\\x9a2f4c8d5e7a3b1c...',  -- BYTEA format
     'a3f1c2d4e5f6...',           -- 32 hex chars
     'x9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4z3y2x1w0',
     '2d8c6f4e3b5a7c1d...',
     NULL);
```

---

## 🔄 Data Flow (Line by Line)

### ESP32 Side (C/C++)

```c
// 1. CAPTURE FRAME
esp_camera_fb_t *fb = esp_camera_fb_get();
uint8_t *grayscale = malloc(fb->width * fb->height);
// Convert RGB565 to grayscale
for (int i = 0; i < fb->width * fb->height; i++) {
    grayscale[i] = (fb->buf[i*2] >> 3) & 0xFF;
}

// 2. EXTRACT BITSTREAM
uint8_t bitstream[16];  // 128 bits
int bit_idx = 0;
for (int i = 0; i < fb->width * fb->height; i++) {
    int byte_idx = bit_idx / 8;
    int bit_pos = bit_idx % 8;
    
    // LSB method
    int bit = grayscale[i] & 0x01;
    bitstream[byte_idx] |= (bit << bit_pos);
    
    bit_idx++;
    if (bit_idx >= 128) break;
}

// 3. CONDITION ENTROPY
uint8_t conditioned[32];
mbedtls_sha256(bitstream, sizeof(bitstream), conditioned, 0);

// 4. DERIVE KEY
uint8_t key_material[32];
char kdf_input[256];
snprintf(kdf_input, sizeof(kdf_input), 
         "esp32-001%lu%s", 
         time(NULL), 
         HARDWARE_SEED);
mbedtls_sha256((uint8_t*)kdf_input, strlen(kdf_input), key_material, 0);
uint8_t aes_key[16];
memcpy(aes_key, key_material, 16);

// 5. ENCRYPT
uint8_t iv[16];
esp_fill_random(iv, sizeof(iv));  // Random IV

mbedtls_aes_context aes;
mbedtls_aes_setkey_enc(&aes, aes_key, 128);
mbedtls_aes_crypt_ctr(&aes, 32, NULL, iv, NULL, 
                       conditioned, encrypted);

// 6. HASH FOR INTEGRITY
uint8_t integrity_hash[32];
char hash_input[512];
snprintf(hash_input, sizeof(hash_input), 
         "%02x...%lu%s", 
         encrypted[0], timestamp, device_id);
mbedtls_sha256((uint8_t*)hash_input, strlen(hash_input), 
               integrity_hash, 0);

// 7. PACKAGE PAYLOAD
char payload[1024];
snprintf(payload, sizeof(payload),
    "{\"device_id\":\"esp32-001\","
    "\"timestamp\":%lu,"
    "\"encrypted_data\":\"%02x%02x%02x...\"," 
    "\"iv\":\"%02x%02x%02x...\","
    "\"integrity_hash\":\"%02x%02x%02x...\","
    "\"image_hash\":\"%02x%02x%02x...\"}",
    timestamp, encrypted[0], encrypted[1], encrypted[2],
    iv[0], iv[1], iv[2],
    integrity_hash[0], integrity_hash[1], integrity_hash[2],
    bitstream_hash[0], bitstream_hash[1], bitstream_hash[2]);

// 8. SEND TO BACKEND
esp_http_client_config_t config = {
    .url = "https://backend.example.com/ingest",
    .method = HTTP_METHOD_POST,
    .cert_pem = CERT_PEM,
};
esp_http_client_handle_t client = esp_http_client_init(&config);
esp_http_client_set_post_field(client, payload, strlen(payload));
esp_perform_http_request(client);
```

### Backend Validation (Python)

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import hashlib
from sqlalchemy.orm import Session

app = FastAPI()

class EntropyPayload(BaseModel):
    device_id: str
    timestamp: int
    encrypted_data: str  # hex
    iv: str              # hex
    integrity_hash: str  # hex
    image_hash: str      # hex

@app.post("/ingest")
async def ingest(payload: EntropyPayload, db: Session):
    """
    VALIDATION LAYER:
    1. Parse request
    2. Recompute hash
    3. Compare for tampering
    4. Store in DB (if valid)
    """
    
    # ✅ Validate schema (Pydantic does this automatically)
    
    # ⚠️  NEVER decrypt or regenerate keys!
    
    # Recompute integrity hash
    verification_input = (
        payload.encrypted_data + 
        str(payload.timestamp) + 
        payload.device_id
    )
    computed_hash = hashlib.sha256(
        verification_input.encode()
    ).hexdigest()
    
    # Tamper detection
    if computed_hash != payload.integrity_hash:
        raise HTTPException(
            status_code=400,
            detail="Integrity mismatch - tampering detected!"
        )
    
    # Get previous hash for chaining
    previous_record = db.query(EntropyRecord).filter(
        EntropyRecord.device_id == payload.device_id
    ).order_by(
        EntropyRecord.created_at.desc()
    ).first()
    
    previous_hash = previous_record.integrity_hash if previous_record else None
    
    # Store in database
    record = EntropyRecord(
        device_id=payload.device_id,
        timestamp=payload.timestamp,
        encrypted_data=bytes.fromhex(payload.encrypted_data),
        iv=payload.iv,
        integrity_hash=payload.integrity_hash,
        image_hash=payload.image_hash,
        previous_hash=previous_hash,
        verified_at=datetime.utcnow()
    )
    
    db.add(record)
    db.commit()
    db.refresh(record)
    
    return {
        "status": "stored",
        "record_id": str(record.id),
        "hash_valid": True
    }

@app.post("/verify/{record_id}")
async def verify(record_id: UUID, db: Session):
    """
    VERIFICATION ENDPOINT:
    Recompute hash and compare
    """
    record = db.query(EntropyRecord).filter(
        EntropyRecord.id == record_id
    ).first()
    
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # Recompute
    verification_input = (
        record.encrypted_data.hex() + 
        str(record.timestamp) + 
        record.device_id
    )
    computed_hash = hashlib.sha256(
        verification_input.encode()
    ).hexdigest()
    
    is_valid = computed_hash == record.integrity_hash
    
    return {
        "record_id": str(record.id),
        "is_valid": is_valid,
        "stored_hash": record.integrity_hash,
        "computed_hash": computed_hash,
        "message": "Authentic" if is_valid else "TAMPERED"
    }
```

---

## 🚫 Critical Rules (Non-Negotiable)

### DO
✅ Encrypt data on ESP32 BEFORE sending  
✅ Include timestamp in all hashes  
✅ Use random IV for each encryption  
✅ Validate all payloads on backend  
✅ Store encrypted data in DB, NOT plaintext  
✅ Chain hashes for tamper detection  
✅ Use HTTPS for all communications  
✅ Log verification failures  

### DON'T
❌ Transmit AES keys over network  
❌ Store unencrypted data  
❌ Reuse IVs across encryptions  
❌ Decrypt data on backend  
❌ Trust client-side validation only  
❌ Use ECB mode (ever)  
❌ Log sensitive data  
❌ Expose encryption keys in error messages  

---

## 📊 Scaling Calculations

### Single ESP32
- Frequency: 1 capture/10 seconds = 6 per minute
- Per-device throughput: 360 records/hour
- Per-device DB size: ~100 bytes/record → 36 KB/hour

### 100 ESP32 Devices
- Total frequency: 600 captures/min = 10 per second
- Total records/hour: 36,000
- Total DB growth: 3.6 MB/hour = 86 MB/day
- PostgreSQL capability: 5000+ inserts/sec
- Index maintenance: ~5ms per insert
- **Status:** ✅ Easily sustainable

### 1000 ESP32 Devices (Edge case)
- Total frequency: 166 captures/sec
- Records/hour: 600,000
- DB growth/day: 860 MB
- PostgreSQL capability: 5000+/sec
- **Status:** ✅ Still feasible, might need read replicas for verification

---

## 🧪 Testing Checklist

- [ ] ESP32 captures frame → grayscale conversion works
- [ ] Bitstream extraction produces 128 bits exactly
- [ ] SHA-256 conditioning produces 32 bytes
- [ ] AES encryption changes IV every run (random)
- [ ] Payload JSON is valid (test with jq/Python json)
- [ ] Backend parses payload without errors
- [ ] Integrity hash verification passes (match test)
- [ ] Database INSERT succeeds
- [ ] Hash chaining works (previous_hash populated correctly)
- [ ] Verification endpoint detects tampering (mismatch test)

---

## 🚀 Production Deployment

1. **Generate Production Seed**
   ```bash
   openssl rand -hex 32 > hardware_seed.bin
   ```

2. **Configure PostgreSQL**
   - Enable backups (daily)
   - Enable WAL archiving
   - Monitor disk space
   - Setup read replicas for scaling

3. **Deploy Backend**
   - Set `DEBUG=False`
   - Enable HTTPS with cert
   - Setup rate limiting
   - Monitor logs for verification failures

4. **Monitor System**
   - Alert on verification failures
   - Alert on integrity_hash mismatches
   - Alert on slow queries
   - Daily backup verification

---

**Implementation Status:** ✅ Architecture Complete  
**Next Step:** Deploy to hardware (ESP32-CAM module)
