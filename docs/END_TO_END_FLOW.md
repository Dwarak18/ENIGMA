# ENIGMA End-to-End Data Flow

## Overview
This document traces how entropy data flows from ESP32 firmware → Backend API → Database → Frontend UI in real-time.

---

## Stage 1: Firmware Capture & Crypto (ESP32-S3)

### Location: `firmware/main/main.c` (lines 45-112)

**Flow:**
1. **Init Phase** (lines 49-60):
   - Initialize NVS flash storage
   - Connect to WiFi (WIFI_SSID, WIFI_PASSWORD)
   - Sync time via NTP (SNTP) to get accurate UNIX timestamp
   - Initialize UART module for JSON communication

2. **Wait for Input** (lines 63-72):
   - Receive hex-encoded payload via UART
   - Validate JSON format; reject if malformed → send `invalid_input` error

3. **AES-128 Encryption** (lines 74-88):
   - Convert hex payload to bytes (max 64 bytes)
   - Call `enigma_aes_encrypt()` from `firmware/main/crypto.c`
   - Encrypts payload using fixed 16-byte AES key (defined in `crypto.c:16-21`)
   - Output: encrypted bytes + encryption length

**Crypto Details** (from `firmware/main/crypto.c`):
```c
// Fixed 16-byte AES key (hardcoded for demo; should be hardware-backed)
static const uint8_t AES_KEY[16] = {
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f
};

// AES encryption: payload_bytes → encrypted_bytes
esp_err_t enigma_aes_encrypt(
  const uint8_t *plaintext, size_t plaintext_len,
  uint8_t *ciphertext, size_t ciphertext_max,
  size_t *ciphertext_len_out
) {
  // Uses mbedTLS ESP-IDF wrapper for AES-CBC
  mbedtls_aes_context ctx;
  mbedtls_aes_setkey_enc(&ctx, AES_KEY, 128);
  // Encrypt in CBC mode (internally handles IV)
  return mbedtls_aes_crypt_cbc(&ctx, MBEDTLS_AES_ENCRYPT, ...);
}
```

4. **RTC Timestamp** (lines 91-97):
   - Get UNIX timestamp from system clock: `get_current_timestamp()`
   - Convert to IST (India Standard Time) string: "YYYY-MM-DD HH:MM:SS"
   - Example: `"2026-05-03 21:33:39"`

5. **Final Integrity Hash** (lines 99-105):
   - Compute SHA-256 of: `encrypted_bytes || timestamp_string`
   - Call `compute_integrity_hash()` from `crypto.c:104-128`
   - Output: 32-byte SHA-256 hash → hex-encoded 64-char string

6. **UART Response** (lines 107-111):
   - Serialize result as JSON via UART:
   ```json
   {
     "ok": true,
     "final_hash": "a1b2c3d4...",  // 64-char hex (SHA-256)
     "timestamp": "2026-05-03 21:33:39",
     "rtc_time": "21:33:39"
   }
   ```

---

## Stage 2: Firmware → Backend API (HTTP POST)

### Transport Layer: firmware simulator or USB UART listener

**External Tool**: `tools/device_listener/listener.py`
- Listens on USB/serial for UART JSON messages
- Performs challenge-response handshake with firmware
- Extracts device_id, public_key, signature from handshake
- Forwards entropy payload to backend

**HTTP POST Endpoint**: `POST /api/v1/entropy`

**Request Payload**:
```json
{
  "device_id": "esp32-001",
  "timestamp": 1746449019,           // UNIX seconds from device
  "entropy_hash": "a1b2c3d4...",     // 64-char hex SHA-256
  "signature": "r_hex||s_hex",       // 128-char hex (ECDSA r||s)
  "public_key": "04||x||y"           // 130-char hex (uncompressed P-256)
}
```

---

## Stage 3: Backend API Validation & Persistence

### Route Entry Point: `backend/src/routes/entropy.js` (lines 25-46)

**Request Handler**: `router.post('/', entropySubmitRules, async (req, res))`

1. **Validation Middleware** (applied via `entropySubmitRules`):
   - Validate request shape (device_id, timestamp, entropy_hash, signature, public_key)
   - Type checking and basic format validation

2. **Delegate to Controller**: `dataController.handlePostData(req.body)`
   - Calls `backend/src/controllers/data.js`
   - Returns validated record or throws error

---

### Service Layer: `backend/src/services/entropyService.js`

**Core Function**: `processEntropy(payloadObj)`

**Flow** (lines 200+):

1. **Resolve Public Key** (lines 171-199):
   - Check in-memory device key cache (Map)
   - If not cached, look up in DB (table `devices`)
   - If payload provides new key, upsert to DB + cache
   - Purpose: Fast signature verification without every-request DB hit

2. **Timestamp Freshness Check** (via middleware):
   - Payload `timestamp` must be within ±60 seconds of server time
   - Reject if `|server_time - payload_time| > MAX_TIMESTAMP_SKEW_S`
   - Error code: `STALE_TIMESTAMP`

3. **Signature Verification** (delegated to `services/verifier.js`):
   - Input: entropy_hash (64-char hex), signature (128-char hex), public_key (130-char hex)
   - Calls `verifySignature(hash, signature, pubkey)`
   - Implementation:
     - Convert signature from raw r||s to DER format
     - Convert public key from uncompressed hex to SPKI format
     - Use Node.js crypto to verify ECDSA-P256 signature
   - Reject if signature invalid → error code: `INVALID_SIGNATURE`

4. **Replay Detection** (via DB unique constraint):
   - Query: Has this `(device_id, timestamp, entropy_hash)` been seen before?
   - DB index: `idx_entropy_replay_guard` on `(device_id, timestamp, entropy_hash)`
   - Insert fails on duplicate → error code: `REPLAY_DETECTED`

5. **Database Insert** (PostgreSQL transaction):
   ```sql
   INSERT INTO entropy_records (
     device_id, timestamp, entropy_hash, signature, 
     rtc_time, created_at
   ) VALUES (
     $1, $2, $3, $4, $5, NOW()
   ) RETURNING *;
   ```
   - Server generates UUID as `id`
   - `created_at` = server insertion time
   - Transaction commits atomically

6. **WebSocket Broadcast** (via Socket.IO):
   - On successful insert, emit to all connected frontend clients:
   ```javascript
   io.emit('entropy:new', {
     id: record.id,
     device_id: record.device_id,
     timestamp: record.timestamp,
     entropy_hash: record.entropy_hash,
     rtc_time: record.rtc_time,
     ts: record.created_at
   });
   ```

---

### Response to Frontend

**HTTP 201 Created**:
```json
{
  "ok": true,
  "data": {
    "id": "uuid-1234",
    "device_id": "esp32-001",
    "timestamp": 1746449019,
    "entropy_hash": "a1b2c3d4...",
    "signature": "r||s",
    "rtc_time": "21:33:39",
    "created_at": "2026-05-03T21:33:40.123Z"
  }
}
```

**Error Responses** (4xx/5xx):
```json
{
  "ok": false,
  "code": "VALIDATION_ERROR|STALE_TIMESTAMP|INVALID_SIGNATURE|REPLAY_DETECTED|INTERNAL_ERROR",
  "message": "Human-readable error detail"
}
```

---

## Stage 4: Device Presence Tracking (Watchdog)

### Mechanism: `entropyService.js` (lines 21-103)

**In-Memory State**:
- `_deviceOnline`: Map<device_id, bool>
- `_deviceTimers`: Map<device_id, NodeJS.Timeout>
- `_trngByDevice`: Map<device_id, TRNG_STATE>

**Watchdog Logic**:
1. On each entropy POST from device_id, reset watchdog timer (DEVICE_WATCHDOG_MS = 15s)
2. If device doesn't POST within 15 seconds, mark offline
3. Emit `device:status` event to frontend with updated online state

**Alternative**: `tools/device_listener/listener.py` can force device online/offline via:
- `POST /api/v1/system/device-status` with `{device_id, online, rtc_time}`
- Calls `entropyService.forceDeviceStatus()`

**TRNG State Machine**:
- `inactive`: No device connected
- `active`: Device online, emitting entropy regularly
- `suspended`: Device was active, now disconnected (frozen state)

Transitions:
- Device comes online → `ACTIVE` (emit to frontend)
- Device goes offline → `SUSPENDED` (if was ACTIVE) or stays `INACTIVE`

---

## Stage 5: Frontend Reception & Display

### WebSocket Connection: `frontend/src/App.jsx` (lines 43-150+)

**Socket.IO Setup**:
```javascript
const socket = io(backendUrl, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});
```

**Event Listeners**:

1. **Connection Events**:
   ```javascript
   socket.on('connect', () => setWsStatus('connected'));
   socket.on('disconnect', () => setWsStatus('disconnected'));
   socket.on('connect_error', () => setWsStatus('error'));
   ```

2. **Entropy Arrival** (`entropy:new`):
   ```javascript
   socket.on('entropy:new', (record) => {
     // Add to records array (state update)
     setRecords(prev => [record, ...prev]);
     // Update latest record for entropy score
     setLatestRecord(record);
   });
   ```

3. **Device Status** (`device:status`):
   ```javascript
   socket.on('device:status', ({ device_id, online, rtc_time, ts }) => {
     setDeviceStates(prev => ({
       ...prev,
       [device_id]: { online, rtc_time, ts }
     }));
     // Show toast notification if status changed
     addToast(device_id, online, rtc_time);
   });
   ```

4. **TRNG State** (`trng:state`):
   ```javascript
   socket.on('trng:state', ({ device_id, state, ts }) => {
     setTrngStatus(prev => ({
       ...prev,
       pipeline: updatePipelineState(prev.pipeline, device_id, state)
     }));
   });
   ```

### Frontend Pages

1. **EntropyPage.jsx**: 
   - Displays live entropy stream (records array)
   - Shows device status badges
   - Real-time updates via entropy:new events

2. **OverviewPage.jsx**:
   - Dashboard with device health, entropy score, TRNG state
   - Device presence indicators (online/offline)
   - Last entropy timestamp

3. **TimeHardwarePage.jsx**:
   - Displays RTC time from device (firmware timestamp)
   - Sync status between device and server

---

## Complete End-to-End Timeline

```
┌─ Firmware (ESP32-S3) ──────────────────────────────────────┐
│                                                            │
│  1. Receive input → 2. AES encrypt → 3. Get RTC time     │
│  4. SHA-256 hash → 5. Send via UART JSON                 │
│                                                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ UART JSON (via device_listener.py)
                     │
┌────────────────────▼──────────────────────────────────────┐
│ Backend API (Node/Express, port 3000)                     │
│                                                            │
│  6. POST /api/v1/entropy validation                       │
│  7. Resolve device public key (cache)                     │
│  8. Verify signature (ECDSA-P256)                         │
│  9. Check timestamp freshness (±60s)                      │
│  10. Detect replay (DB unique index)                      │
│  11. Insert entropy_records (PostgreSQL transaction)      │
│  12. Emit entropy:new via Socket.IO                       │
│  13. Update device watchdog (15s timeout)                 │
│  14. Emit device:status                                   │
│                                                            │
└────────────────────┬──────────────────────────────────────┘
                     │
                     │ Socket.IO real-time events
                     │
┌────────────────────▼──────────────────────────────────────┐
│ Frontend (React/Vite, port 5173)                          │
│                                                            │
│  15. Receive entropy:new event                            │
│  16. Update records[] state array                         │
│  17. Re-render EntropyPage with new record                │
│  18. Compute entropy score (visual feedback)              │
│  19. Display device status badges                         │
│  20. Show RTC time from firmware                          │
│                                                            │
└────────────────────────────────────────────────────────────┘

Total latency:
  - Firmware encrypt + hash: ~10-50ms
  - Network (UART → HTTP): ~5-50ms
  - Backend validation + DB insert: ~20-100ms
  - Socket.IO broadcast: ~2-10ms
  - Frontend re-render: ~5-20ms
  ──────────────────────────────
  Total: ~50-230ms (typical case)
```

---

## Data Model Summary

### devices table
- `device_id` (PK): unique device identifier
- `public_key`: uncompressed P-256 public key (hex)
- `first_seen`, `last_seen`: timestamps

### entropy_records table
- `id` (PK): server-generated UUID
- `device_id` (FK): which device sent this
- `timestamp`: UNIX seconds from device
- `entropy_hash`: SHA-256 of encrypted_data || rtc_time
- `signature`: raw ECDSA signature (r||s)
- `rtc_time`: "HH:MM:SS" from DS3231
- `created_at`: server-side insertion time
- Indexes: `device_id + created_at`, `created_at` (for fast sorting)
- Unique constraint: `(device_id, timestamp, entropy_hash)` for replay prevention

---

## Local Testing Checklist

- [ ] Docker Compose running (backend, DB, frontend)
- [ ] Firmware simulator or real ESP32 connected via UART
- [ ] Device listener (`tools/device_listener/listener.py`) running
- [ ] Backend API responding to health check
- [ ] Frontend WebSocket connected (status: "connected")
- [ ] Send test entropy via device listener
- [ ] Observe entropy:new event in frontend real-time
- [ ] Check entropy_records in PostgreSQL
- [ ] Verify device online/offline badges update
- [ ] Verify RTC time displays correctly

---

## Code References (Quick Lookup)

| Component | File | Key Function |
|-----------|------|--------------|
| Firmware capture | `firmware/main/main.c:45-112` | `app_main()` |
| Firmware AES encrypt | `firmware/main/crypto.c:83-102` | `enigma_aes_encrypt()` |
| Firmware SHA-256 | `firmware/main/crypto.c:104-128` | `compute_integrity_hash()` |
| API route | `backend/src/routes/entropy.js:25-46` | `router.post('/')` |
| Validation | `backend/src/controllers/data.js` | `handlePostData()` |
| Business logic | `backend/src/services/entropyService.js:200+` | `processEntropy()` |
| Signature verify | `backend/src/services/verifier.js` | `verifySignature()` |
| WebSocket | `backend/src/websocket/index.js` | Socket.IO server setup |
| Frontend state | `frontend/src/App.jsx:43-150+` | React state + listeners |
| DB schema | `database/schema.sql:14-80` | `devices`, `entropy_records` |
