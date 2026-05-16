# ENIGMA API

Base URL (local): `http://localhost:3000`

## Core endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/entropy` | Submit signed entropy payload |
| POST | `/api/v1/entropy/data` | Alias for `/api/v1/entropy` |
| GET | `/api/v1/entropy/latest` | Most recent record |
| GET | `/api/v1/entropy/history?limit=100` | Recent records |
| GET | `/api/v1/entropy/anchored` | Confirmed blockchain anchors |
| POST | `/api/v1/entropy/verify/:id` | Verify stored record by id/hash key |
| POST | `/api/v1/entropy/submit-hash` | Manual hash submit to blockchain service |

## Image stream endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/image-streams/capture` | Capture/store encrypted image stream |
| GET | `/api/v1/image-streams/:device_id/latest` | Latest stream for device |
| GET | `/api/v1/image-streams/:device_id/history?limit=20` | Stream history for device |

Notes:
- `POST /api/v1/image-streams/capture` includes `next_capture_in` (seconds) in `data`.
- `GET /latest` and `GET /history` can include `next_capture_in` when called with `?next_capture_in=1`.
- Optional `capture_interval_s=<seconds>` can be provided with `next_capture_in=1` to override the default interval for that response.

## System endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/system/status` | Dashboard system + devices status |
| POST | `/api/v1/system/device-status` | Force online/offline from device listener |
| GET | `/api/v1/system/uptime` | Backend uptime summary |
| GET | `/api/v1/system/trng-status` | TRNG state machine status |
| GET | `/api/v1/system/blockchain-config` | Blockchain UI/runtime config |
| GET | `/api/agent/status` | Blockchain agent summary and recent jobs |

## Health

`GET /health`

```json
{
  "status": "ok",
  "timestamp": "2026-01-01T12:00:00.000Z"
}
```

## Entropy payload contract

Required fields:
- `device_id` (string)
- `timestamp` (unix epoch seconds)
- `entropy_hash` (64-char hex)
- `signature` (128-char hex raw `r||s`)

Optional fields:
- `public_key` (130-char hex, uncompressed P-256)
- `aes_ciphertext`, `aes_iv`, `rtc_time`
- `image_encrypted`, `image_iv`, `image_hash`

Error shape:

```json
{
  "ok": false,
  "code": "VALIDATION_ERROR|STALE_TIMESTAMP|UNKNOWN_DEVICE|INVALID_SIGNATURE|REPLAY_DETECTED|INTERNAL_ERROR",
  "message": "human readable message"
}
```

## WebSocket events

Server emits:
- `entropy:new`
- `system:stats`
- `trng:state`
- `device:status`
- `image:stream`
