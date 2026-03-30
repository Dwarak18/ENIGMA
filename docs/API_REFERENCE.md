# ENIGMA API Reference

Complete REST API documentation for the ENIGMA entropy capture and verification system.

## Base URL

```
Development:   http://localhost:8000
Docker:        http://backend:8000
Production:    https://your-api-domain.com
```

All responses are JSON unless otherwise specified.

## Authentication

Currently, the API does not require authentication. For production deployments, add:
- API Key authentication
- OAuth 2.0
- JWT tokens

## Common Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (validation error) |
| 404 | Resource Not Found |
| 409 | Conflict (duplicate device) |
| 500 | Server Error |

## Endpoints

---

## 🏥 System Endpoints

### GET /health

Health check endpoint for monitoring and load balancing.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "service": "ENIGMA Entropy Backend"
}
```

**Status Codes:**
- 200: Service is healthy

---

### GET /statistics

Get aggregate statistics about registered devices and entropy records.

**Query Parameters:** None

**Response:**
```json
{
  "total_devices": 5,
  "total_entropy_records": 1247,
  "devices_by_count": [
    {
      "device_id": "device-001",
      "record_count": 542
    },
    {
      "device_id": "device-002",
      "record_count": 431
    },
    {
      "device_id": "laptop-cam",
      "record_count": 274
    }
  ]
}
```

---

## 👤 Device Management

### POST /devices

Register a new ENIGMA entropy device.

**Request Body:**
```json
{
  "device_id": "device-001",
  "public_key": "04a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8"
}
```

**Request Validation:**
- `device_id`: 1-255 characters (required)
- `public_key`: Exactly 130 hex characters (secp256r1 uncompressed, required)

**Response:** 200 OK
```json
{
  "device_id": "device-001",
  "public_key": "04a1b2c3...",
  "first_seen": "2024-01-15T10:30:00Z",
  "last_seen": "2024-01-15T10:30:00Z"
}
```

**Status Codes:**
- 200: Device registered successfully
- 400: Validation error (invalid device_id or public_key format)
- 409: Device already registered

**Example:**
```bash
curl -X POST http://localhost:8000/devices \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "my-device",
    "public_key": "04' + ('0'*128) + '"
  }'
```

---

### GET /devices/{device_id}

Retrieve information about a registered device.

**Path Parameters:**
- `device_id`: Device identifier (string)

**Response:** 200 OK
```json
{
  "device_id": "device-001",
  "public_key": "04a1b2c3...",
  "first_seen": "2024-01-15T10:00:00Z",
  "last_seen": "2024-01-15T10:30:00Z"
}
```

**Status Codes:**
- 200: Device found
- 404: Device not found

---

## 📸 Entropy Capture

### POST /capture

Capture image, extract entropy, encrypt, and store in database.

**Full Processing Pipeline:**
1. Decode Base64 JPEG image
2. Convert to 8-bit grayscale
3. Extract bitstream via LSB (Least Significant Bit) method
4. Hash bitstream: `SHA256(bitstream_bytes)` → conditioned entropy
5. Derive AES key: `SHA256(device_id + timestamp + server_seed)` → first 16 bytes
6. Encrypt: `AES-128-CTR(key, random_iv)`
7. Generate integrity hash: `SHA256(encrypted_data + timestamp + key + previous_hash)`
8. Store in database with chaining

**Request Body:**
```json
{
  "image": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "device_id": "device-001"
}
```

**Request Validation:**
- `image`: Base64 string, max 10 MB (required)
- `device_id`: Must be registered device (required)
- Image dimensions: 100-1920 pixels

**Response:** 200 OK
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "device_id": "device-001",
  "timestamp": 1705318200,
  "entropy_hash": "a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3",
  "integrity_hash": "x9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4z3y2x1w0",
  "image_hash": "sha256_of_original_bitstream",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Status Codes:**
- 200: Image captured and encrypted successfully
- 400: Invalid image (size, format, device not registered)
- 500: Processing error

**Data Created in Database:**

| Field | Value |
|-------|-------|
| `aes_ciphertext` | Hex-encoded AES-128-CTR ciphertext |
| `aes_iv` | Hex-encoded random IV (16 bytes) |
| `image_bits` | Hex-encoded original bitstream |
| `image_hash` | 64-char SHA-256 hex of bitstream |
| `integrity_hash` | 64-char SHA-256 hex (verification key) |
| `previous_hash` | Chaining link to previous record |

**Example:**
```bash
# Capture from webcam and send to backend
curl -X POST http://localhost:8000/capture \
  -H "Content-Type: application/json" \
  -d '{
    "image": "'$(base64 -w0 < myimage.jpg)'",
    "device_id": "device-001"
  }'
```

---

## 📖 Record Access

### GET /records

List all entropy records, optionally filtered by device.

**Query Parameters:**
- `device_id` (optional): Filter by device ID
- `limit` (optional, default=100): Maximum records to return (1-1000)

**Response:** 200 OK
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "device_id": "device-001",
    "timestamp": 1705318200,
    "entropy_hash": "a3b4c5d6...",
    "integrity_hash": "x9y8z7w6...",
    "image_hash": "sha256...",
    "created_at": "2024-01-15T10:30:00Z"
  },
  ...
]
```

**Status Codes:**
- 200: Success (returns empty array if no records)

**Example:**
```bash
# Get last 50 records from device-001
curl "http://localhost:8000/records?device_id=device-001&limit=50"
```

---

### GET /records/{record_id}

Retrieve a specific entropy record.

**Path Parameters:**
- `record_id`: UUID of the record

**Response:** 200 OK
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "device_id": "device-001",
  "timestamp": 1705318200,
  "entropy_hash": "a3b4c5d6...",
  "integrity_hash": "x9y8z7w6...",
  "image_hash": "sha256...",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Status Codes:**
- 200: Record found
- 404: Record not found

---

## ✅ Verification

### POST /verify/{record_id}

Verify the integrity of an entropy record.

**Verification Process:**
1. Retrieve record from database
2. Re-derive AES key: `SHA256(device_id + stored_timestamp + server_seed)`
3. Recompute integrity hash: `SHA256(stored_encrypted_data + timestamp + key + previous_hash)`
4. Compare computed hash with stored hash
5. If match: Record is authentic
6. If mismatch: Record has been tampered with

**Path Parameters:**
- `record_id`: UUID of the record to verify

**Response:** 200 OK (Hash Valid)
```json
{
  "record_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_valid": true,
  "timestamp": 1705318200,
  "entropy_hash": "a3b4c5d6...",
  "integrity_hash": "stored_hash_value",
  "computed_hash": "newly_computed_hash_value",
  "message": "Integrity verified"
}
```

**Response:** 200 OK (Hash Mismatch - Tampering Detected!)
```json
{
  "record_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_valid": false,
  "timestamp": 1705318200,
  "entropy_hash": "a3b4c5d6...",
  "integrity_hash": "original_hash",
  "computed_hash": "different_hash",
  "message": "Integrity violation detected"
}
```

**Status Codes:**
- 200: Verification completed (check `is_valid` field)
- 404: Record not found
- 500: Verification error

**Example:**
```bash
curl -X POST http://localhost:8000/verify/550e8400-e29b-41d4-a716-446655440000
```

**Hash Chaining:**

When you verify a record, the system checks:
```
computed = SHA256(
  encrypted_data +
  timestamp +
  aes_key +
  previous_record_hash
)

is_valid = (computed == stored_integrity_hash)
```

If any previous record in the chain is modified, all subsequent `is_valid` values become false.

---

## 🔐 Cryptographic Details

### Key Derivation

**Algorithm:** HMAC-SHA256-based KDF (simplified)

```
derived_key = SHA256(device_id || timestamp || SERVER_RANDOM_SEED)
aes_key_16_bytes = derived_key[0:16]
```

**Properties:**
- Different for every capture (unique timestamp)
- Deterministic (same inputs → same key)
- Device-specific (device_id included)
- Server-specific (server seed acts as salt)

### Encryption

**Mode:** AES-128-CTR (Counter mode)
- **Key Size:** 128 bits (16 bytes)
- **IV:** 128-bit random IV (16 bytes per encryption)
- **Nonce:** Automatically handled by CTR mode

**Properties:**
- Semantic security (same plaintext + different IV = different ciphertext)
- Streaming cipher (no padding needed)
- Parallelizable

### Hashing

**Algorithm:** SHA-256 (FIPS PUB 180-4)
- **Input:** Concatenation of encrypted_data, timestamp, key_material, optional previous_hash
- **Output:** 256-bit (64 hex characters)
- **Collision Resistance:** (theoretically) 2^128 operations

### Hash Chaining

```
Record 1: H1 = SHA256(encrypted_data_1 + ts_1 + key_1)
Record 2: H2 = SHA256(encrypted_data_2 + ts_2 + key_2 + H1)
Record 3: H3 = SHA256(encrypted_data_3 + ts_3 + key_3 + H2)

To forge Record 2:
- Attacker modifies encrypted_data_2
- Must recompute H2' (easy)
- But Record 3 now references old H2, not H2'
- Therefore H3 becomes invalid
- Tampering is detected when verifying Record 3
```

---

## 📊 Data Types

### Device
```typescript
{
  device_id: string,      // 1-255 characters
  public_key: string,     // 130 hex chars (secp256r1 uncompressed)
  first_seen: string,     // ISO 8601 timestamp
  last_seen: string       // ISO 8601 timestamp
}
```

### EntropyRecord
```typescript
{
  id: string,             // UUID v4
  device_id: string,      // FK to devices
  timestamp: number,      // UNIX epoch seconds
  entropy_hash: string,   // 64 hex chars
  integrity_hash: string, // 64 hex chars
  image_hash: string,     // 64 hex chars
  created_at: string      // ISO 8601 timestamp
}
```

### VerificationResult
```typescript
{
  record_id: string,      // UUID of verification target
  is_valid: boolean,      // Hash match result
  timestamp: number,      // UNIX epoch seconds
  entropy_hash: string,   // 64 hex chars
  integrity_hash: string, // Stored value
  computed_hash: string,  // Newly computed value
  message: string         // Human-readable result
}
```

---

## ⚡ Performance Notes

| Operation | Typical Duration |
|-----------|------------------|
| Image capture | 50-200ms |
| Grayscale conversion | 10-50ms |
| Bitstream extraction | 20-100ms |
| SHA-256 hashing | 5-20ms |
| AES-128-CTR encryption | 10-40ms |
| Database insert | 50-200ms |
| Verification | 150-500ms |
| **Total /capture** | **200-800ms** |

---

## 🚨 Error Handling

### Standard Error Response
```json
{
  "detail": "Error message explaining what went wrong"
}
```

### Common Errors

**Invalid Device:**
```json
{
  "detail": "Device device-unknown not registered"
}
```

**Malformed Image:**
```json
{
  "detail": "Invalid image data: Failed to decode image"
}
```

**Validation Error:**
```json
{
  "detail": "Image size must be between 100x100 and 1920x1920 pixels"
}
```

---

## 📝 Implementation Checklist

- [x] POST /devices (device registration)
- [x] GET /devices/{device_id} (device lookup)
- [x] POST /capture (entropy capture & encryption)
- [x] GET /records (list records)
- [x] GET /records/{record_id} (fetch specific record)
- [x] POST /verify/{record_id} (integrity verification)
- [x] GET /health (health check)
- [x] GET /statistics (aggregate stats)

## 🔮 Future Enhancements

- [ ] ECDSA signatures on captured data
- [ ] Timestamp Authority (TSA) integration
- [ ] Blockchain anchoring (Ethereum smart contract)
- [ ] Key rotation & versioning
- [ ] Hardware security module (HSM) integration
- [ ] Audit logging & analytics
- [ ] Rate limiting & API keys
- [ ] Batch verification endpoint

---

**API Version:** 1.0  
**Last Updated:** 2024-01-15
