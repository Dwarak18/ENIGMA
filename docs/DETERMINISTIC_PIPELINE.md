# ENIGMA Deterministic Entropy Pipeline - Implementation Guide

## Overview

This document describes the complete, production-grade deterministic entropy pipeline for ENIGMA. The system integrates browser-based camera entropy extraction, backend orchestration, ESP32 cryptographic processing, PostgreSQL storage, and Hardhat blockchain anchoring.

**Status**: Core components implemented ✅ | Integration pending 🔄 | Full deployment pending ⏳

---

## SYSTEM COMPONENTS IMPLEMENTED

### 1. Frontend Camera Entropy Module
**File**: `frontend/src/modules/cameraEntropyPipeline.js` (546 lines)

**Entry Point**:
```javascript
import { runCompleteCaptureWorkflow } from './modules/cameraEntropyPipeline.js';

const videoElement = document.querySelector('video');
const result = await runCompleteCaptureWorkflow(videoElement);
```

**Output**:
```javascript
{
  frameId: "550e8400-e29b-41d4-a716-446655440000",
  entropyHash: "a1b2c3d4...64chars",
  frameCount: 100,
  bitCount: 76800,
  byteCount: 9600,
  captureDurationMs: 10015,
  status: "success",
  rawEntropyHex: "...",
  rawEntropyBytes: Uint8Array
}
```

**Key Functions**:
- `initializeCamera(videoElement)` - Get media stream
- `captureEntropyPipeline(videoElement)` - Sampling loop
- `applyEntropyWhitening(rawEntropy)` - SHA-256 hashing
- `releaseCamera(videoElement)` - Cleanup
- `runCompleteCaptureWorkflow(videoElement)` - Complete orchestration

**Algorithm**:
1. Create 320x240 canvas (fixed size)
2. Capture frames every 100ms for exactly 10 seconds
3. Convert each frame to grayscale: `gray = 0.299R + 0.587G + 0.114B`
4. For each consecutive frame pair:
   - Compute absolute pixel difference: `diff[i] = |frame[i] - prev_frame[i]|`
   - Extract LSB: `bit = diff[i] & 1`
5. Pack bits into bytes (8 bits/byte)
6. Apply SHA-256 whitening: `entropyHash = SHA256(rawEntropy)`
7. Return structured output

**Constraints Met**:
✅ Exactly 10 second capture (allows ±10% drift)
✅ 10 FPS sampling via setInterval
✅ Frame differencing on grayscale
✅ LSB extraction from differences
✅ SHA-256 whitening mandatory
✅ Structured output with metadata
✅ No Math.random() for entropy
✅ Full error handling with specific codes
✅ Resource cleanup (camera release)

---

### 2. Backend Entropy Orchestration API
**File**: `backend/src/routes/entropyPipeline.js` (450 lines)

**Integration**:
```javascript
// In backend/src/server.js or main app file:
const entropyPipelineRoutes = require('./routes/entropyPipeline');
app.use('/api/v1/entropy', entropyPipelineRoutes);
```

**Endpoints**:

#### POST /api/v1/entropy
**Purpose**: Receive entropy from frontend, validate, verify, and store

**Request**:
```javascript
{
  frameId: "uuid",
  entropyHash: "sha256_64chars",
  frameCount: 100,
  captureDurationMs: 10015,
  captureStartTime: "2026-05-04T22:44:12.809+05:30",
  rawEntropyHex: "..." // optional, for verification
}
```

**Response** (201):
```javascript
{
  ok: true,
  recordId: "550e8400-e29b-41d4-a716-446655440001",
  frameId: "uuid",
  entropyHash: "sha256_hex",
  verification: {
    hashMatches: true,
    verified: true
  },
  nextStages: {
    esp32Encryption: "/api/v1/entropy/{recordId}/encrypt",
    blockchainAnchor: "/api/v1/entropy/{recordId}/anchor",
    verification: "/api/v1/entropy/{recordId}/verify"
  }
}
```

**Validation Rules**:
1. Structure validation (all required fields present)
2. Format validation (entropyHash is 64-char hex)
3. Hash verification (recompute SHA-256 from rawEntropyHex if provided)
4. Timing drift check (capture duration within ±10% of 10 seconds)
5. Frame count validation (expect 90-110 frames for 10 FPS @ 10s)

#### GET /api/v1/entropy/:recordId
**Purpose**: Retrieve entropy record metadata

**Response**:
```javascript
{
  ok: true,
  record: {
    id: "record_uuid",
    device_id: "ENIGMA",
    frame_id: "frame_uuid",
    entropy_hash: "sha256_hex",
    frame_count: 100,
    status: "received",
    stored_at: "2026-05-04T22:44:15.123Z"
  }
}
```

#### POST /api/v1/entropy/:recordId/encrypt
**Purpose**: Prepare entropy for ESP32 AES encryption

**Response**:
```javascript
{
  ok: true,
  recordId: "uuid",
  esp32Payload: {
    frameId: "uuid",
    entropyHash: "sha256_hex",
    deviceId: "ENIGMA",
    timestamp: 1714866255
  }
}
```

#### POST /api/v1/entropy/:recordId/anchor
**Purpose**: Anchor entropy hash on blockchain

**Request**:
```javascript
{
  aesKeyHash: "sha256_hex_64chars",
  sntp_time: 1714866255
}
```

**Response**:
```javascript
{
  ok: true,
  recordId: "uuid",
  finalHash: "sha256(aes_key_hash || frame_id || sntp_time)",
  blockchainTxHash: "0x...",
  verification: "/api/v1/entropy/{recordId}/verify"
}
```

#### GET /api/v1/entropy/:recordId/verify
**Purpose**: Verify entropy integrity against blockchain

**Response**:
```javascript
{
  ok: true,
  recordId: "uuid",
  entropyHash: "sha256_hex",
  aesKeyHash: "sha256_hex",
  blockchainHash: "sha256_hex",
  blockchainTxHash: "0x...",
  verification: {
    entropyHashOnFile: true,
    aesKeyHashOnFile: true,
    blockchainAnchor: "verified",
    blockchainVerified: true,
    status: "verified"
  }
}
```

---

### 3. PostgreSQL Schema
**File**: `database/entropy_pipeline_schema.sql` (400 lines)

**Primary Table: entropy_pipeline**
```sql
CREATE TABLE entropy_pipeline (
    id UUID PRIMARY KEY,
    device_id TEXT NOT NULL,
    frame_id UUID NOT NULL UNIQUE,
    entropy_hash TEXT NOT NULL,          -- SHA-256 (64-char hex)
    aes_key_hash TEXT,                   -- SHA-256 (64-char hex)
    frame_count INTEGER NOT NULL,        -- ~100 for 10 FPS @ 10s
    capture_duration_ms INTEGER NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    stored_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,                -- received → encrypted → anchored → verified
    blockchain_hash TEXT,                -- SHA256(aes_key_hash || frame_id || sntp_time)
    blockchain_tx_hash TEXT,
    blockchain_confirmed_at TIMESTAMPTZ
);
```

**Status Pipeline**:
```
"received"  → Record stored, awaiting encryption
   ↓
"encrypted" → AES-256 key generated and applied
   ↓
"anchored"  → Hash stored on blockchain
   ↓
"verified"  → Blockchain confirmation and integrity verified
```

**Supporting Tables**:
1. `entropy_verification_log` - Audit trail of verification attempts
2. `entropy_error_log` - Error tracking per stage
3. `capture_records` - Per-frame metadata

**Indexes**:
- (device_id, stored_at DESC) - Common queries
- (frame_id) - Lookups
- (status, stored_at DESC) - Filtering by stage
- (blockchain_hash) - Verification

**Constraints**:
- UNIQUE(frame_id) - Prevent duplicate frames
- NOT NULL constraints on critical fields
- CHECK constraints on timing validity
- TIMESTAMPTZ for timezone safety

---

## DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│ BROWSER (Frontend)                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Video Stream                                                   │
│      ↓                                                           │
│  Camera Permission Check                                         │
│      ↓                                                           │
│  Initialize Video Element (320x240)                             │
│      ↓                                                           │
│  Sampling Loop (10 sec @ 100ms intervals)                       │
│      ├─ Frame 1: Draw canvas, extract grayscale                │
│      ├─ Frame 2: Extract differences, LSBs                     │
│      ├─ Frame 3-100: Repeat differencing                       │
│      ↓                                                           │
│  Bitstream (76,800 bits from 100 frames)                       │
│      ↓                                                           │
│  Pack Bits → Bytes (9,600 bytes)                               │
│      ↓                                                           │
│  SHA-256 Whitening (MANDATORY)                                  │
│      ↓                                                           │
│  entropyHash (64-char hex)                                      │
│      │                                                           │
│      └──→ frameId (UUID)                                        │
│      └──→ frameCount (100)                                      │
│      └──→ captureDurationMs (10015)                             │
│      └──→ rawEntropyHex (optional)                              │
│      ↓                                                           │
│  Release Camera Resources                                       │
│      ↓                                                           │
│  POST /api/v1/entropy                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ BACKEND (Node.js/Express) - Orchestration Authority            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  POST /api/v1/entropy                                           │
│      ↓                                                           │
│  Validate Structure                                             │
│      (fields, types, format, timing drift)                      │
│      ↓                                                           │
│  Verify Hash (Independent)                                      │
│      if rawEntropyHex provided:                                 │
│          computed = SHA256(rawEntropyHex)                       │
│          assert computed == claimed                             │
│      ↓                                                           │
│  Store in PostgreSQL                                            │
│      entropy_pipeline {                                         │
│          id, frame_id, entropy_hash,                            │
│          frame_count, status="received"                         │
│      }                                                           │
│      ↓                                                           │
│  Return Links to Next Stages                                    │
│      - /encrypt (ESP32 preparation)                             │
│      - /anchor (blockchain storage)                             │
│      - /verify (verification)                                   │
│                                                                 │
│  [Next: ESP32 Encryption]                                       │
│      ↓                                                           │
│  POST /api/v1/entropy/:recordId/encrypt                         │
│      ↓                                                           │
│  Retrieve entropy_hash from DB                                  │
│      ↓                                                           │
│  Prepare ESP32 Payload {                                        │
│      frameId, entropyHash, timestamp                            │
│  }                                                               │
│      ↓                                                           │
│  [ESP32 processes this payload]                                 │
│                                                                 │
│  [Next: Blockchain Anchoring]                                   │
│      ↓                                                           │
│  POST /api/v1/entropy/:recordId/anchor                          │
│      body: { aesKeyHash, sntp_time }                            │
│      ↓                                                           │
│  Compute Final Hash                                             │
│      finalHash = SHA256(aesKeyHash || frameId || sntp_time)    │
│      ↓                                                           │
│  Call blockchain.storeHash(finalHash)                           │
│      ↓                                                           │
│  Update Status → "anchored"                                     │
│      entropy_pipeline.blockchain_tx_hash = txHash               │
│      entropy_pipeline.blockchain_hash = finalHash               │
│                                                                 │
│  [Next: Verification]                                           │
│      ↓                                                           │
│  GET /api/v1/entropy/:recordId/verify                           │
│      ↓                                                           │
│  Retrieve from DB: entropy_hash, aes_key_hash, blockchain_hash │
│      ↓                                                           │
│  Query Blockchain: verify(blockchain_hash)                      │
│      ↓                                                           │
│  Return { verified: true/false, details }                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ ESP32 (Cryptographic Authority)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Receive: { frameId, entropyHash, timestamp }                  │
│      ↓                                                           │
│  [PENDING IMPLEMENTATION]                                       │
│  - Generate AES-256 key from entropy                           │
│  - Fetch SNTP synchronized time                                │
│  - Encrypt data (AES-256-GCM)                                  │
│  - Compute: finalHash = SHA256(aes_key_hash || sntp_time)      │
│      ↓                                                           │
│  Return: { aesKeyHash, finalHash, sntp_time }                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ BLOCKCHAIN (Hardhat Local) - Immutable Anchor                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Store: finalHash (bytes32)                                     │
│      ↓                                                           │
│  [PENDING IMPLEMENTATION]                                       │
│  - storeHash(bytes32 hash) → tx                                │
│  - verifyHash(bytes32 hash) → bool                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## TRUST MODEL

| Layer | Role | Trust Level | Responsibilities |
|-------|------|------------|-----------------|
| **Browser** | Entropy Source | UNTRUSTED | Capture frames, extract entropy |
| **Backend** | Authority | TRUSTED | Validate, verify, orchestrate |
| **Database** | Storage | NOT TRUSTED | Store hashes only |
| **ESP32** | Crypto Element | TRUSTED | Generate keys, encrypt |
| **Blockchain** | Anchor | TRUSTED | Store immutable proof |

---

## VERIFICATION WORKFLOW

```
User wants to verify that entropy record is legitimate and unmodified.

1. Query: GET /api/v1/entropy/{recordId}/verify
   Returns: {
       entropyHash,
       aesKeyHash,
       blockchainHash,
       blockchainTxHash,
       blockchainVerified: true/false
   }

2. Checks performed:
   ✓ entropyHash exists in PostgreSQL
   ✓ aesKeyHash exists in PostgreSQL
   ✓ blockchainHash exists in Hardhat contract
   ✓ blockchainTxHash is confirmed on blockchain
   ✓ All three hashes match (entropy hasn't been tampered)

3. Verification proof:
   IF all three sources match AND blockchain confirmed
   THEN entropy is genuine and unmodified
   ELSE attempt to identify where tampering occurred
```

---

## ERROR HANDLING

### Frontend Errors
```javascript
// ResultCode enumeration (from cameraEntropyPipeline.js)
ERROR_CAMERA_PERMISSION - Camera access denied
ERROR_CAMERA_NOT_READY - Stream not initialized
ERROR_INSUFFICIENT_ENTROPY - Too few frames captured
ERROR_CANVAS_CONTEXT - Canvas API unavailable
ERROR_FRAME_CAPTURE - Failed to draw frame to canvas
ERROR_TIMING_DRIFT - Capture took too long
ERROR_CRYPTO_UNAVAILABLE - Web Crypto API not available
```

### Backend Errors
```javascript
// HTTP error responses
400 VALIDATION_ERROR - Structure validation failed
400 HASH_MISMATCH - Frontend hash doesn't match raw entropy
400 MISSING_PARAMETERS - Required params missing
404 NOT_FOUND - Record not found
500 INTERNAL_ERROR - Server error
500 BLOCKCHAIN_ERROR - Smart contract call failed
```

### Database Validation
- UNIQUE constraint on frame_id (prevent duplicates)
- CHECK constraints on capture_duration_ms (8-12 seconds)
- CHECK constraints on frame_count (90-110 frames)
- NOT NULL on critical fields

---

## PERFORMANCE TARGETS

| Step | Target | Notes |
|------|--------|-------|
| Camera initialization | <1 second | Wait for videoLoadedMetadata |
| Frame capture (10s) | Exactly 10 seconds | ±100ms tolerance |
| Entropy extraction | <100ms | LSB + packing |
| SHA-256 whitening | <50ms | Browser crypto |
| POST /entropy | <100ms | Validation only |
| Backend hash verification | <50ms | Recompute SHA-256 |
| Database storage | <100ms | Query execution |
| POST /encrypt preparation | <50ms | Data formatting |
| ESP32 AES-256 | <1 second | Hardware acceleration |
| Blockchain anchoring | <5 seconds | Including gas estimation |
| Verification query | <100ms | Database lookup |

---

## INTEGRATION CHECKLIST

- [ ] Register entropyPipeline route in Express app
- [ ] Create entropy_pipeline schema in PostgreSQL
- [ ] Test frontend module with real camera
- [ ] Test backend validation endpoints
- [ ] Test database constraints
- [ ] Implement ESP32 AES module
- [ ] Test ESP32 integration
- [ ] Update Hardhat contract
- [ ] Test blockchain anchoring
- [ ] Implement error handling across all layers
- [ ] Run end-to-end integration tests
- [ ] Load testing (concurrent captures)
- [ ] Document deployment procedures

---

## DEPLOYMENT STEPS

### 1. Database Setup
```bash
cd database
psql -U postgres -d enigma_db -f entropy_pipeline_schema.sql
```

### 2. Backend Integration
```javascript
// In backend/src/server.js
const entropyPipelineRoutes = require('./routes/entropyPipeline');
app.use('/api/v1/entropy', entropyPipelineRoutes);
```

### 3. Test Endpoint
```bash
curl -X POST http://localhost:3000/api/v1/entropy \
  -H "Content-Type: application/json" \
  -d '{
    "frameId": "550e8400-e29b-41d4-a716-446655440000",
    "entropyHash": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0",
    "frameCount": 100,
    "captureDurationMs": 10015
  }'
```

### 4. Verify Database
```sql
SELECT * FROM entropy_pipeline;
SELECT * FROM pg_tables WHERE tablename = 'entropy_pipeline';
```

---

## SECURITY ASSUMPTIONS

1. **Browser isolation**: Page code runs in isolation, cannot be tampered
2. **HTTPS only**: All communication is encrypted in transit
3. **PostgreSQL access**: Restricted via firewall and authentication
4. **ESP32 firmware**: Secure, cannot be reverse-engineered
5. **Hardhat local RPC**: Assumed trustworthy for development
6. **Web Crypto API**: Trusted implementation (browser vendor)

---

## TESTING STRATEGY

### Unit Tests
- Frame differencing algorithm
- Grayscale conversion
- LSB extraction
- Bit packing
- Hash verification

### Integration Tests
- Camera → entropy → hash verification
- Frontend → backend validation
- Database constraints and storage
- Blockchain anchoring
- Verification workflow

### System Tests
- End-to-end full pipeline
- Error handling at each layer
- Timing validation
- Replay protection

---

## FUTURE ENHANCEMENTS

1. **Hardware Security Module (HSM)** integration for key storage
2. **Key rotation** procedures
3. **Monitoring and alerting** for pipeline failures
4. **Public blockchain** deployment (Ethereum testnet)
5. **Third-party security audit**
6. **Performance profiling** and optimization
7. **Distributed verification** across multiple nodes

---

## References

- RFC 5869: HKDF Specification
- NIST SP 800-38D: GCM Mode Specification
- NIST SP 800-90B: Entropy Sources
- Hardhat Documentation: https://hardhat.org
- Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
