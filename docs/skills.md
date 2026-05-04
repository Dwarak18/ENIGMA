# ENIGMA Skills & Technical Concepts

## Required Technical Skills

### 1. **Cryptography & Security**

#### SHA-256 (Secure Hash Algorithm)
- **Purpose**: Entropy whitening, key commitment, integrity verification
- **Input**: Arbitrary length data
- **Output**: 256-bit (32-byte) fixed-length hash
- **Properties**:
  - Deterministic (same input → same output)
  - One-way (cannot reverse hash to find input)
  - Avalanche effect (tiny input change → completely different hash)
  - Collision-resistant (extremely unlikely to find two inputs with same hash)

```javascript
const crypto = require('crypto');
const hash = crypto.createHash('sha256');
hash.update(data);
const digest = hash.digest('hex'); // 64-character hex string
```

#### HKDF-SHA256 (HMAC-based Key Derivation Function)
- **Standard**: RFC 5869
- **Purpose**: Derive cryptographic keys from entropy
- **Phases**:
  1. **Extract**: Compress entropy using HMAC
     ```
     PRK = HMAC-SHA256(salt, input_key_material)
     ```
  2. **Expand**: Derive desired key length
     ```
     T(0) = empty string
     T(1) = HMAC(PRK, T(0) || info || 0x01)
     T(2) = HMAC(PRK, T(1) || info || 0x02)
     OKM = T(1) || T(2) || ... (truncated to L bytes)
     ```

- **Why HKDF?**
  - Extracts maximum entropy from input
  - Supports domain separation (info parameter)
  - Replay protection (salt parameter)
  - Flexible output length
  - Industry standard for key derivation

```javascript
const crypto = require('crypto');
const salt = Buffer.from('device_id:timestamp', 'utf8');
const info = Buffer.from('ENIGMA_AES_256_KEY_DERIVATION', 'utf8');
const derivedKey = crypto.hkdfSync('sha256', inputKey, salt, info, 32);
```

#### AES-256-GCM (Advanced Encryption Standard with Galois/Counter Mode)
- **Key Size**: 256-bit (32 bytes)
- **Nonce/IV**: 96-bit (12 bytes) for GCM
- **Block Size**: 128-bit (16 bytes)
- **Authentication Tag**: 128-bit (16 bytes)

- **Properties**:
  - **Confidentiality**: Only authorized parties can decrypt
  - **Authenticity**: Detects any tampering
  - **Non-malleability**: Cannot modify ciphertext undetected
  - **No padding required**: Flexible plaintext lengths

- **Why GCM?**
  - **NOT ECB**: ECB is deterministic, leaks patterns
  - **NOT CBC**: CBC requires padding, no authentication
  - **GCM**: Modern authenticated encryption, parallel-friendly

```javascript
const crypto = require('crypto');
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([
  cipher.update(plaintext),
  cipher.final()
]);
const authTag = cipher.getAuthTag(); // 16-byte authentication tag
```

---

### 2. **Entropy Extraction & TRNG**

#### Frame Differencing
- **Concept**: Compute pixel-level differences between consecutive frames
- **Why**: Natural variation in camera sensor noise between frames
- **Process**:
  ```
  frame_n   = captured image at time T
  frame_n+1 = captured image at time T+Δt
  diff[i]   = |frame_n[i] - frame_n+1[i]|  (per pixel)
  ```

#### Least Significant Bit (LSB) Extraction
- **Concept**: Extract lowest-order bits from entropy source
- **Why**: LSBs have highest entropy, least correlated with systematic patterns
- **Process**:
  ```
  diff_pixel = 42 (binary: 00101010)
  LSB = diff_pixel & 1 = 0  (lowest bit)
  
  Collect many LSBs:
  [0, 1, 0, 1, 1, 0, 1, ...] → packed into bytes
  ```

#### Entropy Whitening
- **Concept**: Apply cryptographic hash to raw entropy
- **Purpose**: 
  - Distribute entropy uniformly across output bits
  - Remove systematic biases from extraction method
  - Guarantee output is crypto-strength randomness
- **Formula**:
  ```
  whitened_entropy = SHA-256(raw_entropy_bits)
  ```

#### Von Neumann De-biasing (Optional Advanced)
- **Concept**: Remove bias from entropy by comparing consecutive bit pairs
- **Process**:
  ```
  Bit pairs: (0,0) → discard
             (0,1) → output 0
             (1,0) → output 1
             (1,1) → discard
  Result: Uniform distribution
  ```

---

### 3. **Web Technologies**

#### WebRTC / getUserMedia API
- **Purpose**: Access browser camera hardware
- **Constraints**:
  ```javascript
  const constraints = {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: { ideal: 'user' }
    },
    audio: false
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  ```

#### Canvas & ImageData
- **Purpose**: Extract pixel data from video frames
- **Process**:
  ```javascript
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixelArray = imageData.data; // Uint8ClampedArray [R,G,B,A,...]
  ```

#### SubtleCrypto API (Browser Cryptography)
- **Purpose**: Perform cryptographic operations in browser
- **Available**: AES-GCM, SHA-256, HKDF
- **Limitation**: Browser security model (no raw key export)
- **Usage**:
  ```javascript
  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );
  ```

---

### 4. **Backend & Node.js**

#### Express.js Routing
- **Purpose**: HTTP request handling
- **Pattern**:
  ```javascript
  router.post('/endpoint', async (req, res) => {
    const { field } = req.body;
    const result = await processData(field);
    res.json({ ok: true, data: result });
  });
  ```

#### Database Transactions
- **Purpose**: Ensure atomic operations (all-or-nothing)
- **Use Case**: Insert record + update blockchain status atomically
- **Pattern**:
  ```javascript
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO records ...');
    await client.query('UPDATE blockchain_queue ...');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
  ```

#### Connection Pooling
- **Purpose**: Reuse DB connections efficiently
- **Benefit**: Avoid connection exhaustion, improve performance
- **Pattern**:
  ```javascript
  const pool = new Pool({ max: 20, idleTimeoutMillis: 30000 });
  const result = await pool.query(sql, params);
  ```

---

### 5. **Firmware (ESP32)**

#### SNTP (Simple Network Time Protocol)
- **Purpose**: Sync device clock with trusted NTP server
- **Accuracy**: ±100ms typical
- **Usage**: Provide trusted timestamp for blockchain
- **ESP-IDF**:
  ```c
  time_t now = time(NULL);
  struct tm timeinfo = *localtime(&now);
  printf("Current time: %04d-%02d-%02d %02d:%02d:%02d\n",
         timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
         timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
  ```

#### mbedTLS Cryptography
- **Library**: Industry-standard crypto for embedded systems
- **Components**:
  - SHA-256: `mbedtls_sha256_*`
  - AES: `mbedtls_aes_*`, `mbedtls_gcm_*`
  - HMAC: `mbedtls_md_*`

#### UART Serial Communication
- **Purpose**: Send data to backend (USB CDC)
- **Protocol**: Binary messages with frame boundaries
- **ESP-IDF**:
  ```c
  uart_write_bytes(UART_NUM_0, data, length);
  uart_read_bytes(UART_NUM_0, buffer, length, timeout);
  ```

---

### 6. **Smart Contracts (Solidity)**

#### Blockchain Immutability
- **Concept**: Once data is written to blockchain, cannot be changed
- **Use**: Store hash anchors for integrity verification
- **Cost**: Every write is a transaction (costs gas)

#### Mapping & Storage
- **Pattern**:
  ```solidity
  mapping(string => AnchorRecord) public records;
  ```
- **Use**: O(1) lookup for record verification

#### Events for Auditing
- **Purpose**: Create searchable, indexed transaction history
- **Pattern**:
  ```solidity
  event RecordAnchored(string indexed deviceId, bytes32 hash);
  emit RecordAnchored(deviceId, integrityHash);
  ```
- **Benefit**: Frontend can subscribe and monitor in real-time

#### Idempotency Protection
- **Pattern**:
  ```solidity
  require(records[recordKey].timestamp == 0, "Already anchored");
  ```
- **Benefit**: Prevents accidental duplicate records (replay attack)

---

### 7. **Security Concepts**

#### Defense in Depth
- **Principle**: Multiple layers of security
- **Example in ENIGMA**:
  1. **Frontend**: Validate entropy quality, enforce minimum frame count
  2. **Backend**: HKDF derivation, SNTP validation, unique constraints
  3. **Database**: Store only hashes, use TLS for connections
  4. **Blockchain**: Immutable anchor, idempotency check
  5. **Verification**: Multiple sources confirm integrity (DB + chain)

#### Zero-Trust Architecture
- **Principle**: Never trust, always verify
- **Example**:
  ```
  Browser → Backend: Don't trust timestamp, verify with SNTP
  Backend → DB: Verify stored hash matches computed hash
  Frontend → Blockchain: Verify chain hash matches DB hash
  ```

#### Least Privilege
- **Principle**: Minimum necessary permissions
- **Example**:
  - DB user: SELECT, INSERT (no UPDATE, DELETE)
  - Frontend: Read-only access to verification endpoints
  - Smart contract: Only backend can call storeRecord()

#### Fail Secure
- **Principle**: When in doubt, deny access
- **Example**:
  - Stale timestamp → reject (don't accept it)
  - Auth tag verification fails → reject ciphertext (don't decrypt)
  - Hash mismatch → deny verification claim (don't trust)

---

## Key Formulas & References

### Entropy Size Calculation
```
Raw LSB extraction:     ~3 bits per pixel difference
10 frames, 1280×720:    3 × 10 × 1280 × 720 ≈ 27.6 Megabits
Take first 256 bits:    Sufficient for AES-256 key
```

### Hash Computation Chain
```
Phase 1: entropy_hash = SHA-256(raw_entropy_bits)
Phase 2: aes_key = HKDF-SHA256(entropy_hash, salt, info, 32)
Phase 3: aes_key_hash = SHA-256(aes_key)
Phase 4: blockchain_hash = SHA-256(aes_key_hash || frame_id || sntp_time)
```

### Entropy Quality Tests
- **NIST SP 800-22**: Statistical tests for randomness
- **Diehard**: Random number test suite
- **TestU01**: Advanced statistical testing

### Cryptographic Constants
```
AES-256 key size:       256 bits (32 bytes)
SHA-256 output:         256 bits (32 bytes)
AES-GCM nonce:          96 bits (12 bytes) - recommended
AES-GCM tag:            128 bits (16 bytes)
HKDF salt (typical):    0-32 bytes (zero is valid)
Max timestamp skew:     60 seconds (configurable)
Frame capture interval: 10 seconds (configurable)
```

---

## Code Patterns

### Entropy Extraction (Frontend)
```javascript
import { runEntropyPipeline } from './utils/entropyExtractor';

const frameDataArray = [frame1.data, frame2.data, ...frame10.data];
const result = await runEntropyPipeline(
  frameDataArray,
  uuidv4(), // frame_id
  Math.floor(Date.now() / 1000), // sntp_timestamp
  'device_id'
);
// result = { entropyHash, aesKeyHash, integrityHash, ... }
```

### Key Derivation (Backend)
```javascript
const { deriveKeyMaterial } = require('./services/keyDerivationService');

const keyMaterial = deriveKeyMaterial(
  entropyHash,
  deviceId,
  sntpTimestamp,
  frameId
);
// keyMaterial = { aesKeyDerived, aesKeyHash, iv, blockchainHash }

// Store hash and blockchain hash, discard aesKeyDerived
await db.query(
  'INSERT INTO records (device_id, aes_key_hash, blockchain_hash) VALUES ($1, $2, $3)',
  [deviceId, keyMaterial.aesKeyHash, keyMaterial.blockchainHash]
);
```

### Verification (Backend)
```javascript
const computed = SHA256(aesKeyHash + frameId + sntpTime);
const stored = record.blockchain_hash;
const verified = (computed === stored);
```

---

## Testing Strategy

### Unit Tests
- Entropy extraction functions
- HKDF derivation (test vectors from RFC 5869)
- Hash computations
- Integrity verification logic

### Integration Tests
- Full pipeline: capture → derive → encrypt → store → verify
- Replay attack prevention
- Timestamp validation
- Blockchain anchoring and verification

### Security Tests
- Entropy quality (NIST tests)
- Side-channel analysis (timing attacks)
- Differential cryptanalysis
- Boundary conditions (max/min values)

### Functional Tests
- Camera capture on various devices
- SNTP sync accuracy
- Database constraints enforcement
- Smart contract idempotency

---

## References & Further Reading

- **Cryptography**: 
  - "Cryptographic Engineering" by Ferguson, Schneier, Kohno
  - RFC 5869 (HKDF)
  - NIST SP 800-38D (GCM)

- **Entropy**:
  - NIST SP 800-90B (Entropy Sources)
  - NIST SP 800-90C (Random Bit Generation)

- **Blockchain**:
  - "Mastering Ethereum" by Andreas Antonopoulos
  - Solidity documentation

- **Embedded Systems**:
  - ESP-IDF documentation
  - mbedTLS API reference

