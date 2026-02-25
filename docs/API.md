# ENIGMA – API Contract

## Base URL

```
https://your-domain.example.com/api/v1
```

---

## Authentication

Version 1 uses no API key. The chain of trust is established by ECDSA signature
verification on every request. Rate-limiting and IP filtering provide perimeter
defence. Future versions may add device JWT tokens issued at registration.

---

## Endpoints

### POST `/entropy`

Submit a signed entropy record from an edge device.

#### Request

```http
POST /api/v1/entropy
Content-Type: application/json
```

```json
{
  "device_id":    "esp32-001",
  "timestamp":    1700000000,
  "entropy_hash": "a3f1...d9c4",
  "signature":    "4f2e...88b0",
  "public_key":   "0482...3c1a"
}
```

| Field          | Type    | Required | Description                                          |
|----------------|---------|----------|------------------------------------------------------|
| `device_id`    | string  | ✓        | Device identifier (max 64 chars)                    |
| `timestamp`    | integer | ✓        | UNIX epoch seconds (must be within ±60s of server)  |
| `entropy_hash` | string  | ✓        | 64-char lowercase hex SHA-256 digest                |
| `signature`    | string  | ✓        | 128-char lowercase hex raw ECDSA r‖s signature      |
| `public_key`   | string  | ✗        | 130-char hex uncompressed P-256 key (sent once)     |

#### Responses

| Code | Body                                     | Meaning                         |
|------|------------------------------------------|---------------------------------|
| 201  | `{ ok: true, data: <record> }`           | Accepted, stored, broadcast     |
| 400  | `{ ok: false, code, message }`           | Validation / signature failure  |
| 409  | `{ ok: false, code: "REPLAY_DETECTED" }` | Duplicate submission            |
| 429  | `{ ok: false, code: "RATE_LIMITED" }`    | Too many requests               |
| 500  | `{ ok: false, code: "INTERNAL_ERROR" }`  | Server error                    |

**Error codes:**

| Code                | Meaning                                      |
|---------------------|----------------------------------------------|
| `VALIDATION_ERROR`  | Missing / malformed required fields          |
| `STALE_TIMESTAMP`   | Timestamp outside ±60s window                |
| `UNKNOWN_DEVICE`    | Device not registered and no public_key sent |
| `INVALID_SIGNATURE` | ECDSA verification failed                    |
| `REPLAY_DETECTED`   | Same (device_id, timestamp, hash) seen before|

---

### GET `/entropy/latest`

Returns the most recent validated entropy record.

```http
GET /api/v1/entropy/latest
```

#### Response 200

```json
{
  "ok": true,
  "data": {
    "id":           "550e8400-e29b-41d4-a716-446655440000",
    "device_id":    "esp32-001",
    "timestamp":    1700000000,
    "entropy_hash": "a3f1...d9c4",
    "signature":    "4f2e...88b0",
    "created_at":   "2025-02-25T10:00:00.000Z"
  }
}
```

#### Response 404

```json
{ "ok": false, "code": "NOT_FOUND" }
```

---

### GET `/entropy/history`

Returns a paginated list of validated entropy records, newest first.

```http
GET /api/v1/entropy/history?limit=100
```

| Query param | Type    | Default | Max  |
|-------------|---------|---------|------|
| `limit`     | integer | 100     | 1000 |

#### Response 200

```json
{
  "ok":    true,
  "count": 42,
  "data":  [ /* array of record objects */ ]
}
```

---

## WebSocket Events (Socket.IO)

Connect to `wss://your-domain.example.com` using Socket.IO client.

### Server → Client

#### `entropy:new`

Emitted immediately after a record is validated and stored.

```json
{
  "id":           "550e8400-...",
  "device_id":    "esp32-001",
  "timestamp":    1700000000,
  "entropy_hash": "a3f1...d9c4",
  "signature":    "4f2e...88b0",
  "created_at":   "2025-02-25T10:00:00.000Z",
  "verified":     true
}
```

#### `entropy:history`

Emitted in response to a `entropy:fetch_history` request.

```json
[ /* array of record objects */ ]
```

### Client → Server

#### `entropy:fetch_history`

```json
{ "limit": 20 }
```

---

## Health Check

```http
GET /health
```

```json
{ "ok": true, "service": "enigma-backend" }
```

---

## Prometheus Metrics (optional)

```http
GET /metrics
```

Requires `ENABLE_METRICS=true` in the backend environment.
Access is restricted to internal network addresses by Nginx.

**Custom metrics:**

| Metric                              | Type    | Labels      |
|-------------------------------------|---------|-------------|
| `enigma_entropy_received_total`     | Counter | `device_id` |
| `enigma_entropy_verified_total`     | Counter | `device_id` |
| `enigma_entropy_rejected_total`     | Counter | `reason`    |
| `enigma_ws_connections`             | Gauge   | –           |
