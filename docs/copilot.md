# ENIGMA Security Architecture & Threat Model

## System Overview

ENIGMA is a hardware-backed entropy generation and blockchain anchoring system consisting of:

1. **Frontend** (Browser): Camera-based entropy extraction
2. **Backend** (Node/Express): Key derivation, validation, persistence
3. **Firmware** (ESP32): SNTP time synchronization, cryptographic operations
4. **Database** (PostgreSQL): Secure storage of hashes (never raw keys)
5. **Blockchain** (Hardhat/Ethereum): Immutable hash anchors

---

## Data Flow: Entropy → Key → Blockchain

### Phase 1: Entropy Extraction (Frontend)

```
1. Capture 10 consecutive camera frames (JPEG, 1280x720)
2. Compute frame-to-frame pixel differences
3. Extract LSBs from differences (least predictable bits)
   - Why LSBs? They have highest entropy in camera noise
4. Pack bits into 256-bit (32-byte) entropy blob
5. Apply SHA-256 whitening (mandatory before key usage)
   entropy_hash = SHA-256(raw_entropy)
6. Send entropy_hash to backend
```

**Why NOT use raw image?**
- Images are compressible → poor entropy source
- Frame differencing amplifies noise → high entropy
- LSB extraction removes systematic camera bias

### Phase 2: Key Derivation (Backend)

```
1. Receive entropy_hash from frontend
2. Derive AES-256 key using HKDF-SHA256:
   
   aes_key = HKDF-SHA256(
     entropy_hash,
     salt=deviceId:timestamp,
     info="ENIGMA_AES_256_KEY_DERIVATION_v1",
     length=32 bytes
   )

3. Hash the key (NEVER store raw key):
   aes_key_hash = SHA-256(aes_key)
   
4. Generate IV for encryption (12 bytes)
5. Compute blockchain integrity hash:
   blockchain_hash = SHA-256(aes_key_hash || frame_id || sntp_time)
6. Store aes_key_hash + blockchain_hash in database
7. Anchor blockchain_hash to smart contract
```

**Why HKDF?** (RFC 5869)
- Extracts randomness from entropy (extract phase)
- Expands to desired key size (expand phase)
- Adds salt to prevent key reuse
- Industry standard for key derivation

**Why hash the key?**
- Provides commitment without exposing raw key
- If DB is compromised, raw key is not leaked
- Still allows verification (hash comparison)

### Phase 3: Encryption (Backend)

```
1. Use AES-256-GCM with:
   - Key: aes_key (from derivation, kept ephemeral)
   - IV: randomly generated 12-byte nonce
   - Data: captured image frame or entropy bits
   - Mode: GCM (Galois/Counter Mode) for authenticated encryption

2. GCM provides:
   - Confidentiality: only authorized parties read data
   - Authenticity: detects tampering via auth tag
   - No padding required
   - 16-byte authentication tag

3. Output: ciphertext || auth_tag (appended)
4. Store in database:
   - encrypted_data (hex)
   - iv (hex)
   - (auth_tag is part of encrypted_data)
```

**Why GCM not CBC/ECB?**
- ECB: Deterministic, pattern leakage (INSECURE)
- CBC: Requires padding, no authentication (VULNERABLE to tampering)
- GCM: Authenticated encryption, modern standard (SECURE)

### Phase 4: Blockchain Anchoring (Backend)

```
1. Compute final integrity hash:
   blockchain_hash = SHA-256(aes_key_hash || frame_id || sntp_time)

2. Call smart contract storeRecord():
   storeRecord(device_id, sntp_time, blockchain_hash)

3. Smart contract:
   - Stores hash immutably on-chain
   - Records block number for tamper-proofing
   - Prevents record overwriting (replay attack protection)

4. Return blockchain transaction hash to frontend
```

**Integrity Properties:**
- `aes_key_hash`: Cryptographic commitment to entropy
- `frame_id`: Unique identifier (prevents duplicates)
- `sntp_time`: Prevents timestamp spoofing (uses trusted SNTP)
- SHA-256: Cryptographically secure hash (no collisions)

---

## Security Assumptions

### 1. **Entropy Source Quality**
- **Assumption**: Camera captures random noise (not systematic patterns)
- **Mitigation**: LSB extraction focuses on random bits, frame differencing removes bias
- **Verification**: Run entropy tests (NIST/Diehard) on extracted bits

### 2. **SNTP Time Accuracy**
- **Assumption**: SNTP timestamp from ESP32 is accurate (within ±5 seconds)
- **Mitigation**: Validate against server time, reject stale timestamps
- **Verification**: Backend enforces MAX_TIMESTAMP_SKEW_S check

### 3. **Cryptographic Primitives**
- **Assumption**: SHA-256, AES-256-GCM, HKDF-SHA256 are unbroken
- **Mitigation**: Use only NIST/IETF approved algorithms
- **Verification**: Audit implementations, use vetted libraries (mbedTLS, Node crypto)

### 4. **Database Security**
- **Assumption**: PostgreSQL access is restricted (firewall, authentication)
- **Mitigation**: Store only hashes, never raw keys or plaintext images
- **Verification**: Encrypted connections (SSL/TLS), least privilege access

### 5. **Blockchain Immutability**
- **Assumption**: Local Hardhat RPC is trustworthy (development only)
- **Mitigation**: Use public testnet/mainnet for production
- **Verification**: Verify block hashes against multiple nodes

### 6. **Frontend Security**
- **Assumption**: Browser environment is not compromised (malware)
- **Mitigation**: HTTPS only, CSP headers, no eval()
- **Verification**: Regular security audits, dependency scanning

---

## Threat Model & Mitigations

### Threat 1: Entropy Quality Degradation

**Attack**: Attacker uses low-entropy source (static image, constant camera input)

**Impact**: Weak AES key → encryption broken

**Mitigations**:
1. Validate entropy_hash against known good ranges (statistical tests)
2. Enforce minimum frame count (10 frames)
3. Monitor average pixel differences per frame
4. Reject if LSB extraction yields < 256 bits
5. Add entropy accumulation (multiple captures)

**Verification**: 
```
Frontend: Check that each frame differs by avg pixel delta > 5
Backend: Run NIST SP 800-22 tests on entropy before key derivation
```

### Threat 2: Timestamp Spoofing

**Attack**: Attacker submits old timestamp to trigger key reuse

**Impact**: Same aes_key_hash for different entropy → key compromise

**Mitigations**:
1. Reject timestamps outside MAX_TIMESTAMP_SKEW_S window (60s)
2. Use SNTP time from ESP32 (not browser time)
3. Enforce unique (device_id, timestamp, entropy_hash) constraint in DB
4. Add server-side timestamp override if timestamp is stale

**Verification**:
```
Backend: Enforce unique index on (device_id, timestamp, entropy_hash)
Test: Try to replay old entropy → should fail with STALE_TIMESTAMP
```

### Threat 3: Replay Attack

**Attack**: Attacker resubmits same entropy_hash to generate duplicate key

**Impact**: Same AES key used twice → security guarantee breaks

**Mitigations**:
1. Database unique constraint: (device_id, timestamp, entropy_hash)
2. Blockchain idempotency: require(records[recordKey].timestamp == 0)
3. Nonce-like behavior: each capture must have new timestamp
4. Frontend enforces one capture per 10-second interval minimum

**Verification**:
```
Test: POST same entropy twice → second fails with REPLAY_DETECTED
Test: Blockchain rejects duplicate storeRecord() calls
```

### Threat 4: AES Key Compromise via DB Breach

**Attack**: Attacker gains DB access, steals raw AES keys

**Impact**: All encrypted data can be decrypted

**Mitigations**:
1. NEVER store raw AES key in database
2. Store only aes_key_hash = SHA-256(aes_key)
3. Encryption key is ephemeral (exists only in memory during encryption)
4. After encryption, key is discarded (no persistent storage)

**Verification**:
```
DB schema: Only aes_key_hash column (64-char hex), no aes_key_secret
Code review: No string containing "AES_KEY =" persisted
```

### Threat 5: Image Tampering

**Attack**: Attacker modifies encrypted image in DB

**Impact**: Data integrity lost

**Mitigations**:
1. Use AES-256-GCM (authenticated encryption)
2. Authentication tag detects any tampering
3. Store image_hash = SHA-256(original_image) separately
4. Blockchain hash includes aes_key_hash (committed to key)
5. Any modification invalidates both auth tag and blockchain hash

**Verification**:
```
Test: Flip one bit in ciphertext → decryption fails (auth tag invalid)
Test: Compute SHA-256(encrypted_data) after tampering → doesn't match
```

### Threat 6: Timestamp Forgery on Blockchain

**Attack**: Attacker submits false block.timestamp to blockchain

**Impact**: Fake timestamp on-chain record

**Mitigations**:
1. Backend computes blockchain_hash using sntp_timestamp (not block.timestamp)
2. Blockchain stores only hash (not timestamp) in hash computation
3. Timestamp is recorded separately for audit
4. Verify SNTP timestamp against backend clock before anchoring

**Verification**:
```
Test: Block.timestamp ≠ sntp_timestamp → hash still valid if sntp_timestamp correct
Audit: Check backend.sntp_timestamp matches recorded timestamp
```

---

## Cryptographic Components

### SHA-256 (Whitening & Hashing)

```
Purpose: Entropy whitening, key commitment, integrity hashing
Input:   Variable length
Output:  256-bit (32-byte) hash
Used in:
  1. entropy_hash = SHA-256(raw_entropy_bits)
  2. aes_key_hash = SHA-256(aes_key)
  3. blockchain_hash = SHA-256(aes_key_hash || frame_id || sntp_time)
Security: No known attacks, NIST approved
```

### HKDF-SHA256 (Key Derivation)

```
RFC 5869 - HMAC-based Extract-and-Expand Key Derivation Function

Extract: PRK = HMAC-SHA256(salt, entropy_hash)
Expand:  OKM = HKDF-Expand(PRK, info, length)

Used: aes_key = HKDF(entropy_hash, salt, info, 32)

Security:
  - Extracts full entropy from input
  - Expands to desired key size
  - Domain separation via info string
  - Replay protection via salt
```

### AES-256-GCM (Authenticated Encryption)

```
Key size:     256-bit (32 bytes)
IV/Nonce:     96-bit (12 bytes) 
Block size:   128-bit
Auth tag:     128-bit (16 bytes)
Mode:         Galois/Counter Mode (GCM)

Properties:
  - Confidentiality: Attacker cannot read plaintext
  - Authenticity: Attacker cannot tamper without detection
  - No padding required
  - Parallel-friendly

Security: NIST approved, no known practical attacks
```

---

## Verification Workflow

### To Verify Record Integrity:

```
1. Retrieve from DB:
   - frame_id (UUID)
   - aes_key_hash (SHA-256 hex)
   - sntp_timestamp (UNIX epoch)
   - blockchain_hash (stored anchor)

2. Recompute integrity hash:
   computed_hash = SHA-256(aes_key_hash || frame_id || sntp_timestamp)

3. Compare:
   - DB hash == computed hash?
   - Blockchain hash == computed hash?

4. If all match → Integrity verified ✓
   - Entropy was genuine (captured at this time)
   - Key derivation was correct
   - No tampering detected
```

### Smart Contract Verification:

```solidity
function verifyRecord(string recordKey, bytes32 expectedHash)
    external returns (bool isValid)
{
    // Retrieve stored hash from blockchain
    AnchorRecord storage record = records[recordKey];
    
    // Compare with expected hash
    isValid = (record.integrityHash == expectedHash);
    
    // Emit verification event for audit trail
    emit RecordVerified(recordKey, expectedHash, isValid);
    
    return isValid;
}
```

---

## Security Checklist for Deployment

- [ ] Never hardcode AES keys (use HKDF derivation)
- [ ] Never store raw AES keys (store only hashes)
- [ ] Use AES-256-GCM (not ECB, CBC, or stream ciphers)
- [ ] Enforce SNTP time validation (reject stale timestamps)
- [ ] Implement replay protection (unique constraints in DB + blockchain)
- [ ] Use HTTPS for all frontend-backend communication
- [ ] Use TLS for DB connections
- [ ] Use authenticated encryption for all sensitive data
- [ ] Validate entropy quality before key derivation
- [ ] Audit smart contract code (formal verification recommended)
- [ ] Test emergency key rotation procedure
- [ ] Monitor for unusual entropy patterns
- [ ] Implement rate limiting on entropy submission
- [ ] Use separate keys for different devices/contexts
- [ ] Rotate SNTP servers periodically
- [ ] Maintain audit logs for all cryptographic operations

---

## References

- RFC 5869: HKDF (Cryptographic Key Derivation Function)
- NIST SP 800-38D: Recommendation for GCM Mode
- NIST SP 800-90B: Recommendation for Entropy Sources
- NIST SP 800-90C: Recommendation for Random Bit Generator Construction
- CWE-327: Use of a Broken or Risky Cryptographic Algorithm
- CWE-330: Use of Insufficiently Random Values

