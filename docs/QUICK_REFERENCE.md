# ENIGMA Quick Reference - Architecture & Database Guide

**Core Truth:** Your system's credibility depends 90% on database design and hash integrity, not the camera or encryption algorithm.

---

## 🗄️ Database Selection (Decision Tree)

### Choose Your Database Based on Stage

| Stage | Choice | Why | Limitations |
|-------|--------|-----|-------------|
| **Prototype** | SQLite | Zero setup, instant | Single user, no scaling |
| **Development** | PostgreSQL | Exactly what you need | More setup |
| **Production** | PostgreSQL | Reliability + integrity | Cloud config needed |

**Bottom Line:** Unless you have zero infrastructure, use **PostgreSQL**.

---

## 🏗️ Complete Data Flow (ESP32 → Backend → DB → Frontend)

```
┌──────────────────────────────────────────────────────────┐
│ STEP 1: ESP32 CAPTURE & PROCESS (LOCAL)                 │
├──────────────────────────────────────────────────────────┤
│ 1. Capture frame (160x120 grayscale)                     │
│ 2. Extract bitstream: bit = pixel & 0x01                │
│ 3. Condition: SHA256(bitstream)                          │
│ 4. Derive key: SHA256(device_id + timestamp + seed)      │
│ 5. Encrypt: AES-128-CTR(key, random_iv)                 │
│ 6. Hash: SHA256(encrypted + timestamp + device_id)      │
│ 7. Package JSON payload (NEVER send key!)               │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 2: PAYLOAD TRANSMISSION (HTTPS)                    │
├──────────────────────────────────────────────────────────┤
│ POST /ingest                                             │
│ {                                                        │
│   "device_id": "esp32-001",                             │
│   "timestamp": 1700000000,                              │
│   "encrypted_data": "base64...",                        │
│   "iv": "base64...",                                    │
│   "integrity_hash": "hex64...",                         │
│   "image_hash": "hex64..."                              │
│ }                                                        │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 3: BACKEND VALIDATION (TRUST BOUNDARY)             │
├──────────────────────────────────────────────────────────┤
│ 1. Parse & validate schema                              │
│ 2. Recompute: SHA256(encrypted + timestamp + device_id) │
│ 3. IF match → store, ELSE → reject                      │
│ ⚠️  DO NOT decrypt, DO NOT generate keys               │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 4: DATABASE PERSISTENCE (PostgreSQL)               │
├──────────────────────────────────────────────────────────┤
│ entropy_records {                                        │
│   id (UUID)           ← Primary key                      │
│   device_id           ← Tracking                         │
│   timestamp           ← Time binding                     │
│   encrypted_data      ← BYTEA (binary)                   │
│   iv                  ← Random nonce                     │
│   integrity_hash      ← Verification key                │
│   image_hash          ← Original bitstream hash         │
│   previous_hash       ← Chain linkage                    │
│   created_at          ← Server time                      │
│ }                                                        │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 5: FRONTEND VISUALIZATION & VERIFICATION (React)  │
├──────────────────────────────────────────────────────────┤
│ 1. Fetch records: GET /records                          │
│ 2. Verify: POST /verify/{record_id}                     │
│ 3. Display: hash match = ✅ authentic                   │
│ 4. Hash mismatch = ⚠️  tampering detected              │
└──────────────────────────────────────────────────────────┘
```

---

## 🎯 What Data Goes Where? (CRITICAL)

| Data Type | Storage | Why |
|-----------|---------|-----|
| **Metadata** (timestamp, device_id, hashes) | PostgreSQL | Queryable, indexed |
| **Encrypted binary** (encrypted_data) | PostgreSQL BYTEA | Immutable, integrity |
| **Raw images** (if stored) | File system, NOT DB | Massive files = DB killer |
| **Integrity chain** (previous_hash) | PostgreSQL | Supports relationships |
| **Fast access cache** | Redis (optional) | Speeds up verification |

**⚠️ BRUTAL TRUTH:**
If you store 5MB images in your database, your system will collapse.  
Store only the `image_path = "/images/2026/03/frame_001.jpg"`

---

## 🗄️ PostgreSQL Schema (Exact)

```sql
CREATE TABLE entropy_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,                 -- FK to devices table
    timestamp BIGINT NOT NULL,               -- UNIX epoch seconds
    encrypted_data BYTEA NOT NULL,           -- Core encrypted bitstream
    iv TEXT NOT NULL,                        -- Random IV (hex 32 chars)
    integrity_hash TEXT NOT NULL,            -- Verification key (hex 64 chars)
    image_hash TEXT NOT NULL,                -- Original bitstream hash (hex 64 chars)
    previous_hash TEXT,                      -- Chain linkage (NULL for first)
    created_at TIMESTAMPTZ DEFAULT NOW()     -- Server time
);

-- Critical indexes for integrity verification
CREATE INDEX idx_entropy_device_timestamp 
    ON entropy_records(device_id, created_at DESC);
CREATE INDEX idx_entropy_hash 
    ON entropy_records(integrity_hash);
```

---

## 🚀 Implementation Order (DON'T SKIP STEPS)

**Layer 1: ESP32 Firmware**
- [ ] Camera capture
- [ ] Grayscale conversion  
- [ ] Bitstream extraction (LSB method)
- [ ] Entropy conditioning (SHA-256)
- [ ] Key derivation (device-bound)
- [ ] AES-128-CTR encryption
- [ ] Integrity hash generation
- [ ] JSON payload construction

**Layer 2: Backend Validation**
- [ ] POST /ingest endpoint
- [ ] Schema validation
- [ ] Hash recomputation
- [ ] Store in PostgreSQL BYTEA
- [ ] Hash chaining support

**Layer 3: Database**
- [ ] PostgreSQL setup
- [ ] entropy_records table
- [ ] Proper indexes
- [ ] Backup strategy

**Layer 4: Frontend Display**
- [ ] Record list view
- [ ] Verification checker
- [ ] Hash comparison UI

---

## � API Validation Endpoint (Backend POST /ingest)

**What the backend does (VALIDATION ONLY):**

```python
# backend/app/routers/ingest.py
@app.post("/ingest")
async def ingest(payload: EntropyPayload, db: Session = Depends(get_db)):
    """
    1. Validate schema
    2. Recompute integrity_hash
    3. Compare with incoming hash
    4. If match: store in DB, else: reject
    """
    # Key rule: DO NOT decrypt, DO NOT generate keys
    
    # Recompute verification
    computed_hash = sha256(
        payload.encrypted_data + 
        str(payload.timestamp) + 
        payload.device_id
    ).hexdigest()
    
    if computed_hash != payload.integrity_hash:
        raise HTTPException(status_code=400, detail="Integrity mismatch")
    
    # Store in DB
    record = EntropyRecord(
        device_id=payload.device_id,
        timestamp=payload.timestamp,
        encrypted_data=payload.encrypted_data,
        iv=payload.iv,
        integrity_hash=payload.integrity_hash,
        image_hash=payload.image_hash,
        previous_hash=get_previous_hash(payload.device_id)
    )
    db.add(record)
    db.commit()
    
    return {"status": "stored", "record_id": record.id}
```

---

## 🧪 Testing & Verification

### Test 1: Database Schema
```bash
# Connect to PostgreSQL
psql -U enigma -d enigma_db -c "
  SELECT tablename FROM pg_tables 
  WHERE schemaname = 'public';"

# Expected output:
#  tablename        
# ─────────────────
#  entropy_records
```

### Test 2: Integrity Hash Verification
```bash
# Fetch record and verify manually
psql -U enigma -d enigma_db -c "
  SELECT device_id, integrity_hash, created_at 
  FROM entropy_records 
  ORDER BY created_at DESC LIMIT 1;"

# Test verification endpoint
curl -X POST http://localhost:8000/verify/<RECORD_ID>
# Expected: { "is_valid": true }
```

### Test 3: Hash Chain Integrity
```sql
-- Check that each record references the previous
SELECT 
  id,
  device_id,
  integrity_hash,
  previous_hash,
  previous_hash = LAG(integrity_hash) OVER (
    PARTITION BY device_id 
    ORDER BY created_at
  ) as chain_valid
FROM entropy_records
ORDER BY device_id, created_at;
```

### Test 4: Catch Tampering
```python
# Simulate tampering
import psycopg2

conn = psycopg2.connect("dbname=enigma_db user=enigma password=changeme")
cur = conn.cursor()

# Modify encrypted_data
cur.execute("""
  UPDATE entropy_records 
  SET encrypted_data = 'deadbeef...'
  WHERE id = '550e8400-e29b-41d4-a716-446655440000'
""")
conn.commit()

# Now verify via API
curl -X POST http://localhost:8000/verify/550e8400-e29b-41d4-a716-446655440000
# Expected: { "is_valid": false, "message": "Integrity violation detected" }
```

### Test 5: WebSocket Real-Time Updates (Optional)
```javascript
// In browser console
const socket = io('http://localhost');
socket.on('entropy:new', (record) => {
  console.log('New record:', record.id);
  console.log('Hash match:', record.is_valid);
});
```

---

## 📊 Performance Benchmarks

| Operation | Time | Component |
|-----------|------|-----------|
| Image capture | 50-100ms | ESP32 camera |
| Bitstream extraction | 20-50ms | ESP32 processor |
| SHA-256 conditioning | 5-15ms | ESP32 crypto |
| AES-128-CTR encryption | 10-30ms | ESP32 crypto |
| Key derivation | 5-10ms | ESP32 crypto |
| HTTP POST | 100-300ms | Network |
| Backend validation | 50-100ms | FastAPI |
| Database insert | 50-150ms | PostgreSQL |
| **Total end-to-end** | **300-850ms** | Complete system |

**Scaling note:** At 1000 devices × 10 captures/min = 166 inserts/sec.  
PostgreSQL can handle 5000+/sec with proper indexing.

---

## 🔍 Debugging Checklist

### ESP32 Issues

- [ ] Serial output shows "Camera initialized"
- [ ] Bitstream extraction produces 128 bits
- [ ] SHA-256 hash is valid (64 hex chars)
- [ ] Encryption output changed with each run (random IV)
- [ ] JSON payload is valid (test with jq)

### Backend Issues

- [ ] PostgreSQL connection working: `docker compose logs backend | grep -i postgres`
- [ ] Table exists: `SELECT * FROM entropy_records LIMIT 1`
- [ ] Indexes exist: `SELECT * FROM pg_stat_user_indexes`
- [ ] API responds: `curl http://localhost:8000/health`

### Frontend Issues

- [ ] API calls show in browser DevTools Network tab
- [ ] CORS headers present in responses
- [ ] Verification returns is_valid: true/false
- [ ] Hash display matches database values

---

## 🚀 Production Deployment Checklist

- [ ] Change `SERVER_RANDOM_SEED` to 32-byte random value
- [ ] Set `DEBUG=False` in .env
- [ ] Enable PostgreSQL backups (daily)
- [ ] Setup monitoring (CloudWatch, New Relic)
- [ ] Configure alerts for verification failures
- [ ] Enable HTTPS for all endpoints
- [ ] Restrict CORS to your domain only
- [ ] Log all verification attempts
- [ ] Plan for key rotation strategy

---

## 📚 Key Files in Current Implementation

```
backend/app/
├── config.py           ← Database URL, security settings
├── database.py         ← SQLAlchemy PostgreSQL connection
├── models.py           ← entropy_records ORM model
├── schemas.py          ← Request/response validation
├── main.py             ← FastAPI routes (/capture, /verify, etc.)
└── services/
    ├── crypto.py       ← Key derivation, hashing
    └── image_processing.py ← Bitstream extraction

database/
└── schema.sql          ← CREATE TABLE entropy_records

docs/
├── API_REFERENCE.md    ← Complete API docs
├── SETUP_DEPLOYMENT.md ← Local + cloud setup
└── ENIGMA_FULL_SYSTEM.md ← Architecture overview
```

---

## ⚡ Quick Commands

### Start Everything
```bash
docker compose up -d --build && sleep 10 && curl http://localhost:8000/health
```

### Check Logs
```bash
docker compose logs -f backend  # Backend logs
docker compose logs -f postgres # Database logs
```

### Register Test Device
```bash
curl -X POST http://localhost:8000/devices \
  -H "Content-Type: application/json" \
  -d '{"device_id":"test-001","public_key":"04'$(printf '0%.1000s' | tr ' ' '0')''"}'
```

### List All Records
```bash
curl http://localhost:8000/records | jq '.[] | {id, device_id, timestamp}'
```

### Verify a Record
```bash
RECORD_ID="550e8400-e29b-41d4-a716-446655440000"
curl -X POST http://localhost:8000/verify/$RECORD_ID | jq '.is_valid'
```

### Database Backup
```bash
docker compose exec postgres pg_dump -U enigma enigma_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore from Backup
```bash
docker compose exec postgres psql -U enigma enigma_db < backup_20260330_120000.sql
```

---

## 🎯 Next Steps

1. **Verify PostgreSQL integrity** → Test hash chaining with Test 3
2. **Deploy ESP32** → Flash firmware, confirm serial output
3. **Run /ingest endpoint** → Send test payloads
4. **Monitor verification** → Catch tampering with Test 4
5. **Scale testing** → 1000+ records, measure performance

---

## 🐛 Troubleshooting

### Camera Not Found
```
E (1234) camera: Camera init failed: 0x101
```
**Fix**: Check power supply (5V 1A), verify PSRAM enabled

### Bitstream Empty
```
W (1234) camera: Frame buffer capture failed
```
**Fix**: Increase PSRAM size in `sdkconfig`

### Backend Validation Error
```json
{
  "code": "VALIDATION_ERROR",
  "message": "image_encrypted must be a 16-64 character hex string"
}
```
**Fix**: Check firmware is sending proper hex string

### Decryption Fails
```
Error: Invalid IV length
```
**Fix**: Ensure `image_iv` is exactly 32 hex characters (16 bytes)

---

## 📊 File Locations

### Firmware
```
firmware/main/
├── camera.c              # Image capture
├── camera.h              # Camera interface
├── aes_encryption.c      # AES-256 encryption
├── aes_encryption.h      # AES interface
├── main.c                # Integration (updated)
└── config.h              # Configuration (updated)
```

### Backend
```
backend/src/
├── middleware/
│   └── validate.js       # Validation rules (updated)
└── services/
    └── entropyService.js # Processing (updated)
```

### Frontend
```
frontend/src/
└── components/
    ├── ImageBitstreamDisplay.jsx  # Display component
    └── ImageBitstreamCard.jsx     # Card wrapper
```

### Docs
```
docs/
├── IMAGE_BITSTREAM.md         # Full documentation
├── IMPLEMENTATION_SUMMARY.md  # Summary
├── API.md                     # API contract (updated)
└── QUICK_REFERENCE.md         # This file
```

---

## 📈 Monitoring

### Check Image Records in DB
```sql
SELECT 
  COUNT(*) FILTER (WHERE image_encrypted IS NOT NULL) as with_image,
  COUNT(*) FILTER (WHERE image_encrypted IS NULL) as without_image,
  COUNT(*) as total
FROM entropy_records;
```

### WebSocket Events
```javascript
socket.on('entropy:new', (record) => {
  if (record.image_encrypted) {
    console.log('📸 Image bitstream received!');
  }
});
```

---

## 🔒 Security Notes

1. **Key Security**: Entropy bytes (AES key) never transmitted
2. **IV Security**: New random IV per image (TRNG)
3. **Integrity**: SHA-256 hash verifies original bitstream
4. **Privacy**: Original image discarded, only encrypted bits stored

---

## 📞 Need Help?

- **Full Docs**: `docs/IMAGE_BITSTREAM.md`
- **API Spec**: `docs/API.md`
- **Architecture**: `docs/ARCHITECTURE.md`
- **Summary**: `docs/IMPLEMENTATION_SUMMARY.md`

---

**Last Updated**: March 30, 2026  
**Version**: 1.0.0
