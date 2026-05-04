# ENIGMA Deterministic Entropy Pipeline - Visual Architecture

## System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                          ENIGMA ENTROPY PIPELINE                               │
│                                                                                │
│  TRUST MODEL: Browser (Untrusted) → Backend (Authority) → Blockchain (Anchor) │
└────────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════════

                            ┌─────────────────────────┐
                            │  BROWSER (Untrusted)    │
                            │  Camera Entropy Source  │
                            └──────────────┬──────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    │                                              │
                    ▼                                              ▼
        ┌─────────────────────┐                      ┌─────────────────────┐
        │ navigator.media     │                      │  Canvas 320x240     │
        │ getUserMedia()      │                      │  Fixed Resolution   │
        └────────┬────────────┘                      └─────────────────────┘
                 │                                             ▲
                 │ Video Stream                                │ drawImage()
                 │                                             │
        ┌────────▼──────────────────────────────────────────────────────┐
        │                   CAPTURE LOOP (10 sec @ 10 FPS)             │
        │                    100ms intervals via setInterval            │
        │                                                               │
        │  Frame 0        Frame 1        Frame 2  ...  Frame 99        │
        │    ▼              ▼              ▼                 ▼          │
        │  ┌───┐          ┌───┐          ┌───┐           ┌───┐        │
        │  │   │ ─diff──► │   │ ─diff──► │   │  ─diff──► │   │        │
        │  │   │ LSBs     │   │ LSBs     │   │ LSBs      │   │        │
        │  └───┘          └───┘          └───┘           └───┘        │
        │   Gray            Gray            Gray            Gray       │
        │   0.299R+         0.299R+         0.299R+        0.299R+    │
        │   0.587G+         0.587G+         0.587G+        0.587G+    │
        │   0.114B          0.114B          0.114B         0.114B     │
        │                                                               │
        └────────┬──────────────────────────────────────────────────────┘
                 │
                 │ Bitstream (76,800 bits from 100 frames @ 320x240)
                 │
        ┌────────▼──────────────────────────────────────────────────┐
        │              BITSTREAM PROCESSING                         │
        │                                                            │
        │  Pack 8 bits per byte → 9,600 bytes                      │
        │                                                            │
        │  Raw Entropy Uint8Array (32 minimum, 9,600 actual)       │
        └────────┬──────────────────────────────────────────────────┘
                 │
        ┌────────▼──────────────────────────────────────────────────┐
        │          SHA-256 WHITENING (Web Crypto API)             │
        │          MANDATORY before any use                         │
        │                                                            │
        │  entropyHash = SHA256(rawEntropy)                         │
        │  64-char hex: a1b2c3d4...0f0e0d0c                         │
        └────────┬──────────────────────────────────────────────────┘
                 │
                 │ Structured Output
                 ▼
        ┌─────────────────────────────────────────────┐
        │ entropyHash: "a1b2c3d4..."                 │
        │ frameId: UUID                              │
        │ frameCount: 100                            │
        │ captureDurationMs: 10015                   │
        │ bitCount: 76800                            │
        │ status: "success"                          │
        └────────┬────────────────────────────────────┘
                 │
                 │ POST /api/v1/entropy
                 ▼
═══════════════════════════════════════════════════════════════════════════════════

                    ┌──────────────────────────┐
                    │  BACKEND (Trusted Auth)  │
                    │  Node.js / Express       │
                    │  Port 3000               │
                    └──────────────┬───────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                │                                      │
                ▼                                      ▼
    ┌─────────────────────┐            ┌──────────────────────────┐
    │  VALIDATION LAYER   │            │  VERIFICATION LAYER      │
    │                     │            │                          │
    │ ✓ Structure         │            │ 1. Extract rawEntropy    │
    │ ✓ Format            │            │ 2. Compute SHA256        │
    │ ✓ Timing Drift      │            │ 3. Compare with claimed  │
    │ ✓ Frame Count       │            │ 4. Pass/Fail             │
    └────────┬────────────┘            └──────────────┬───────────┘
             │                                        │
             │ Pass                                   │
             │                                        ▼
             │                                    Pass: ✅
             │                                    Fail: ❌
             │                                        │
             └────────────────────┬───────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │   STORAGE LAYER (HASHES)   │
                    │   PostgreSQL                │
                    │                            │
                    │  INSERT INTO               │
                    │  entropy_pipeline {        │
                    │    id: UUID,               │
                    │    frame_id: UUID,         │
                    │    entropy_hash: hex,      │
                    │    status: "received"      │
                    │  }                         │
                    │                            │
                    │  🛡️ HASHES ONLY, NEVER     │
                    │     RAW ENTROPY/KEYS       │
                    └─────────────┬──────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │   RESPONSE TO FRONTEND     │
                    │                            │
                    │  200 OK {                  │
                    │   recordId: UUID,          │
                    │   nextStages: {            │
                    │     encrypt,               │
                    │     anchor,                │
                    │     verify                 │
                    │   }                        │
                    │  }                         │
                    └─────────────┬──────────────┘
                                  │
═══════════════════════════════════════════════════════════════════════════════════

                        ┌─────────────────────┐
                        │  ESP32 (Pending)    │
                        │  Secure Crypto      │
                        │  SNTP Time Sync     │
                        └────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
        ┌─────────────────────┐   ┌──────────────────┐
        │  AES-256-GCM        │   │  SNTP Fetch      │
        │  Key Generation     │   │  Trusted Time    │
        │  (from entropy)      │   │  UNIX timestamp  │
        │                     │   │                  │
        │  aesKeyHash         │   │  sntp_time       │
        │  = SHA256(key)      │   │  = 1714866255    │
        └────────┬────────────┘   └────────┬─────────┘
                 │                         │
                 └────────────┬────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  FINAL HASH        │
                    │  COMPUTATION       │
                    │                    │
                    │  finalHash =       │
                    │  SHA256(           │
                    │   aesKeyHash ||    │
                    │   frame_id ||      │
                    │   sntp_time        │
                    │  )                 │
                    └─────────┬──────────┘
                              │
                              ▼
═══════════════════════════════════════════════════════════════════════════════════

                    ┌─────────────────────────┐
                    │  BLOCKCHAIN (Anchor)    │
                    │  Hardhat Local RPC      │
                    │  Smart Contract         │
                    └────────┬────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
    ┌──────────────────────┐  ┌─────────────────────┐
    │  storeHash()         │  │  verifyHash()       │
    │  bytes32 finalHash   │  │  returns bool       │
    │  ↓                   │  │                     │
    │  Contract storage    │  │  Check if hash      │
    │  transaction → 0x... │  │  exists on chain    │
    └────────┬─────────────┘  └─────────┬───────────┘
             │                          │
             │                          │
             └──────────────┬───────────┘
                            │
                    ┌───────▼────────┐
                    │  blockchainTxHash
                    │  blockchainHash
                    │  blockchainConfirmed
                    │                │
                    │  Status:       │
                    │  "anchored"    │
                    └───────┬────────┘
                            │
═══════════════════════════════════════════════════════════════════════════════════

                ┌──────────────────────────┐
                │  VERIFICATION (Final)    │
                │  GET /verify endpoint    │
                └────────────┬─────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
            ▼                                 ▼
    ┌──────────────────┐          ┌──────────────────┐
    │  DB Records      │          │  Blockchain      │
    │  entropyHash     │          │  query           │
    │  aesKeyHash      │          │                  │
    │  blockchainHash  │          │  verifyHash()    │
    └────────┬─────────┘          └────────┬─────────┘
             │                             │
             └────────────┬────────────────┘
                          │
                ┌─────────▼──────────┐
                │  VERIFICATION      │
                │  LOGIC             │
                │                    │
                │  ✓ All hashes match│
                │  ✓ Blockchain txn  │
                │  ✓ Confirmed       │
                │                    │
                │  → "verified" ✅   │
                │     OR             │
                │  → "unverified" ❌ │
                └────────────────────┘
```

---

## Data Flow Diagram

```
┌────────────────┐
│ FRONTEND       │
├────────────────┤
│ Camera Capture │ ──┐
│ (10s @ 10FPS)  │  │
└────────────────┘  │
                    │ entropyHash
                    │ frameId
                    │ frameCount
                    │ captureDurationMs
                    ▼
             ┌──────────────┐
             │ POST /entropy│
             └──────┬───────┘
                    │
                    │ Validation
                    │ Hash Verification
                    │
                    ▼
         ┌─────────────────────┐
         │ PostgreSQL Storage  │
         │                     │
         │ entropy_pipeline {  │
         │  id                 │
         │  frame_id           │
         │  entropy_hash       │
         │  status: received   │
         │ }                   │
         └──────────┬──────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
    ┌────────────┐      ┌──────────────┐
    │ POST       │      │ GET          │
    │ /encrypt   │      │ /recordId    │
    │            │      │              │
    │ Prepare    │      │ Retrieve     │
    │ ESP32      │      │ metadata     │
    │ payload    │      └──────────────┘
    └────┬───────┘
         │
         │ aesKeyHash
         │ sntp_time
         │ finalHash
         │
         ▼
    ┌──────────────┐
    │ POST /anchor │
    └──────┬───────┘
           │
           │ Smart contract call
           │ blockchainTxHash
           │ blockchainHash
           │
           ▼
    ┌──────────────────┐
    │ Hardhat Contract │
    │ Storage Layer    │
    └──────┬───────────┘
           │
           │ Hash stored
           │ Status: anchored
           │
           ▼
    ┌──────────────┐
    │ GET /verify  │
    │              │
    │ Return:      │
    │ - entropyHash│
    │ - aesKeyHash │
    │ - blockHash  │
    │ - verified?  │
    └──────────────┘
```

---

## Status Transition Diagram

```
┌─────────────┐
│  CREATED    │  (Record inserted)
└──────┬──────┘
       │ POST /entropy
       │
       ▼
┌──────────────┐
│  RECEIVED    │  (Stored, awaiting encryption)
└──────┬───────┘
       │ POST /encrypt
       │ (ESP32 processes)
       │
       ▼
┌──────────────┐
│  ENCRYPTED   │  (Key generated, awaiting anchor)
└──────┬───────┘
       │ POST /anchor
       │ (Call smart contract)
       │
       ▼
┌──────────────┐
│  ANCHORED    │  (On blockchain, awaiting verification)
└──────┬───────┘
       │ GET /verify
       │ (Query blockchain)
       │
       ▼
┌──────────────┐
│  VERIFIED    │  (Confirmed and validated)
└──────────────┘
       │
       └─ Success: All hashes match ✅


ALTERNATIVE PATHS:

POST /entropy (validation fails)
       │
       ▼
┌──────────────┐
│  FAILED      │  (Structure or hash mismatch)
└──────────────┘

POST /anchor (blockchain fails)
       │
       ▼
┌──────────────┐
│  ANCHORED    │  (Can be retried)
│  FAILED      │
└──────────────┘
```

---

## Database Schema Relationships

```
┌─────────────────────────────┐
│  entropy_pipeline           │
│  (Main Record Table)        │
├─────────────────────────────┤
│ id (PK) UUID                │
│ device_id TEXT              │
│ frame_id UUID (UNIQUE) ◄────┼──────────┐
│ entropy_hash TEXT           │          │
│ aes_key_hash TEXT           │          │
│ frame_count INTEGER         │          │
│ capture_duration_ms INTEGER │          │
│ status TEXT                 │          │
│ blockchain_hash TEXT        │          │
│ blockchain_tx_hash TEXT     │          │
│ created_at TIMESTAMPTZ      │          │
└──────────┬──────────────────┘          │
           │                             │
    ┌──────┴──────┐                     │
    │             │                     │
    ▼             ▼                     │
┌────────────┐ ┌──────────────────┐   │
│entropy_    │ │entropy_error_log │   │
│verification│ ├──────────────────┤   │
│_log        │ │id (PK)           │   │
├────────────┤ │device_id TEXT    │   │
│id (PK)     │ │frame_id UUID     ◄───┤
│entropy_id  │ │pipeline_stage    │   │
│(FK)        │ │error_code TEXT   │   │
│verification│ │error_message TEXT│   │
│_type TEXT  │ │occurred_at TS    │   │
│verified BOOL│ └──────────────────┘   │
│details JSONB│                        │
│verified_at  │                        │
└────────────┘                         │
                                       │
                            ┌──────────┘
                            │
                            ▼
                    ┌─────────────────┐
                    │capture_records  │
                    ├─────────────────┤
                    │id (PK)          │
                    │entropy_id (FK)  │
                    │frame_number INT │
                    │grayscale_hash   │
                    │difference_hash  │
                    │stored_at TS     │
                    └─────────────────┘
```

---

## Trust Boundary Diagram

```
┌────────────────────────────────────────────────────────────────┐
│  PUBLIC INTERNET (Untrusted)                                   │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  BROWSER (Limited Trust)                               │  │
│  │                                                         │  │
│  │  - No security assumptions about camera data          │  │
│  │  - No cryptographic operations                        │  │
│  │  - User may manipulate frontend code                  │  │
│  │  - All outputs must be validated by backend           │  │
│  │                                                         │  │
│  │  Entropy Source: Camera (Noisy, Not Secure)           │  │
│  │  Output: entropyHash, frameId, metadata               │  │
│  └──────────────────┬──────────────────────────────────────┘  │
│                     │ POST (untrusted)                        │
│                     ▼                                         │
└──────────────────────┼──────────────────────────────────────────┘
                       │
              HTTPS/TLS Boundary
                       │
┌──────────────────────┼──────────────────────────────────────────┐
│  SECURE SERVER (Trusted)                                       │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  BACKEND (Trusted Authority)                           │  │
│  │                                                         │  │
│  │  - Validates all inputs                                │  │
│  │  - Verifies hashes independently                       │  │
│  │  - Makes security decisions                            │  │
│  │  - Orchestrates pipeline                               │  │
│  │                                                         │  │
│  │  TRUST: Never trust frontend-generated values          │  │
│  │  VERIFY: Always recompute hashes                       │  │
│  └──────────┬──────────────────────────────────────────────┘  │
│             │                                                 │
│     ┌───────┴────────┐                                        │
│     │                │                                        │
│     ▼                ▼                                        │
│  ┌────────────┐  ┌──────────────┐                            │
│  │PostgreSQL  │  │Hardhat RPC   │                            │
│  │(Hashes)    │  │(Blockchain)  │                            │
│  │            │  │              │                            │
│  │NOT TRUSTED │  │TRUSTED       │                            │
│  │for auth    │  │IMMUTABLE     │                            │
│  │            │  │              │                            │
│  │Store only: │  │Store only:   │                            │
│  │- Hashes    │  │- Hashes      │                            │
│  │- Metadata  │  │- Transaction │                            │
│  │NO SECRETS  │  │              │                            │
│  └────────────┘  └──────────────┘                            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                       │
              (Future: ESP32 Integration)
                       │
              ┌────────▼─────────┐
              │  ESP32 (Trusted) │
              │  - Key generation│
              │  - Crypto ops    │
              │  - SNTP time     │
              │  - Sealed module │
              └──────────────────┘
```

---

## Verification Proof Chain

```
User wants to prove entropy record is legitimate:

Step 1: Query Database
        GET /api/v1/entropy/{recordId}/verify
        ↓
        Returns {
          entropyHash: "a1b2c3d4...",
          aesKeyHash: "f1e2d3c4...",
          blockchainHash: "e1d2c3b4..."
        }

Step 2: Query Blockchain
        Call verifyHash(blockchainHash)
        ↓
        Returns: true/false (exists on chain)

Step 3: Verification Logic
        IF entropyHash matches stored DB
        AND aesKeyHash matches stored DB
        AND blockchainHash matches smart contract
        AND blockchain transaction is confirmed
        
        THEN ✅ Record is VERIFIED (unmodified)
        ELSE ❌ Record is TAMPERED (modified)

Step 4: Display Result
        Blockchain verified: true/false
        All hashes match: true/false
        Overall status: VERIFIED / UNVERIFIED


TAMPERING SCENARIOS:
─────────────────────

Scenario 1: Modified entropy_hash in DB
        DB: a1b2c3d4...
        Blockchain: e1d2c3b4...
        Result: ❌ Mismatch → DETECTED

Scenario 2: Modified aes_key_hash in DB
        DB: f1e2d3c4...
        Expected: (recomputed) a1b2c3d4...
        Result: ❌ Mismatch → DETECTED

Scenario 3: Blockchain record deleted
        query result: Not found
        DB exists: true
        Result: ❌ Missing from chain → DETECTED

Scenario 4: All three match (No tampering)
        DB: matches
        Blockchain: matches
        Recomputation: matches
        Result: ✅ VERIFIED
```

---

## Error Handling Flow

```
Frontend Error Detection
├─ ERROR_CAMERA_PERMISSION
│  └─ User denies camera access
│
├─ ERROR_INSUFFICIENT_ENTROPY
│  └─ Too few frames captured
│
├─ ERROR_TIMING_DRIFT
│  └─ Capture took >10% longer
│
└─ ERROR_CRYPTO_UNAVAILABLE
   └─ Web Crypto API not available


Backend Error Detection
├─ VALIDATION_ERROR
│  ├─ Missing required fields
│  ├─ Invalid format (hex, etc)
│  └─ Timing drift >10%
│
├─ HASH_MISMATCH
│  └─ Frontend hash ≠ computed hash
│
├─ INTERNAL_ERROR
│  ├─ Database error
│  └─ Crypto operation failed
│
└─ BLOCKCHAIN_ERROR
   └─ Smart contract call failed


Database Validation
├─ NOT NULL constraints
├─ UNIQUE constraints (frame_id)
├─ CHECK constraints (timing, count)
└─ Foreign key constraints


Recovery Paths
├─ Validation fails → Return 400
├─ Hash mismatch → Return 400
├─ Database fails → Return 500 + retry
└─ Blockchain fails → Retry queue (implement)
```

This architecture diagram shows the complete system flow from camera capture through blockchain verification.
