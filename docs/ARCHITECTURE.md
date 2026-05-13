# ENIGMA Architecture

## Core pipeline

```text
Device/Simulator
  -> POST /api/v1/entropy
  -> validation + signature verification
  -> PostgreSQL write (replay-protected)
  -> websocket broadcast (entropy:new)
  -> optional blockchain anchor retry worker
```

## Runtime components

| Component | Entry point | Responsibility |
|---|---|---|
| Backend API | `backend/src/server.js` | REST routes, websocket server, blockchain retry worker |
| Entropy flow | `backend/src/routes/entropy.js`, `backend/src/services/entropyService.js` | Validation, signature verification, persistence, events |
| System/status flow | `backend/src/routes/system.js` | Device heartbeat/watchdog, dashboard system state |
| Frontend app | `frontend/src/App.jsx` | Live dashboard, websocket consumers, API views |
| Database | `database/schema.sql` | `devices`, `entropy_records`, `image_streams`, `pending_blockchain` |
| Contracts | `contracts/*.sol` | Local Hardhat anchoring contract logic |
| Firmware simulator | `firmware/simulate.py` | ESP32-like payload/signature generation for local testing |
| Device listener | `tools/device_listener/listener.py` | Serial bridge + device status updates |

## Data and trust model

1. Device sends `device_id`, `timestamp`, `entropy_hash`, `signature` (+ optional `public_key`).
2. Backend enforces timestamp skew and payload shape.
3. Signature format is raw `r||s` hex and key format is uncompressed P-256 hex.
4. Backend verifies signature and writes record.
5. Replay protection is guaranteed by unique `(device_id, timestamp, entropy_hash)`.
6. Realtime consumers receive `entropy:new` and related system events over Socket.IO.

## Online/offline semantics

Device status in API/UI is sourced from in-memory watchdog state in the backend, not only from database timestamps.

## Environment shape

- Local compose stack: PostgreSQL + Hardhat + backend + frontend + simulator + device listener.
- Backend default port: `3000`.
- Frontend dev port: `5173` (Vite).
