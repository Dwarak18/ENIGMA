# ENIGMA – System Architecture

## Overview

ENIGMA is a real-time entropy generation and cryptographic signing system with
end-to-end verification. It treats the pipeline:

```
Entropy → Hash → Signature → Verification → Storage → Visualization
```

as an unbroken **chain of trust**.

---

## Component Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         EDGE LAYER                                   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ESP32-S3 Firmware (IDF 5.x)                                │    │
│  │                                                             │    │
│  │  entropy.c ──► crypto.c ──► network.c                       │    │
│  │  (TRNG)        (SHA-256      (HTTPS POST)                   │    │
│  │                 ECDSA sign)                                  │    │
│  │                                                             │    │
│  │  storage.c  – NVS encrypted keypair persistence             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │ HTTPS                                 │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│                      TRANSPORT LAYER                                 │
│                      Nginx (TLS termination)                         │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                   │                    │
          ▼                   ▼                    ▼
  POST /api/v1/entropy   WebSocket           Static SPA
          │             (Socket.IO)          (frontend)
          │
┌─────────▼──────────────────────────────────────────────────────────┐
│                     BACKEND LAYER (Node.js)                        │
│                                                                    │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │  routes/     │  │  services/       │  │  websocket/        │  │
│  │  entropy.js  │─►│  verifier.js     │  │  index.js          │  │
│  │              │  │  (ECDSA verify)  │  │  (Socket.IO)       │  │
│  └──────────────┘  │                  │  └────────────────────┘  │
│                    │  entropyService  │─────────────────────────►│  │
│                    │  .js             │   emit('entropy:new')    │  │
│                    │  (persist + emit)│                          │  │
│                    └──────────────────┘                          │  │
│                              │                                   │  │
│                    ┌─────────▼──────────┐                        │  │
│                    │  db/pool.js (pg)   │                        │  │
│                    └─────────┬──────────┘                        │  │
└──────────────────────────────┼─────────────────────────────────── ┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│                    DATABASE LAYER (PostgreSQL)                       │
│                                                                      │
│   devices            entropy_records                                 │
│   ──────────         ────────────────────                            │
│   device_id PK       id (UUID) PK                                    │
│   public_key         device_id FK                                    │
│   first_seen         timestamp                                       │
│   last_seen          entropy_hash                                    │
│                      signature                                       │
│                      created_at                                      │
│                      UNIQUE(device_id, timestamp, entropy_hash)      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
1. ESP32 collects 64 bytes from hardware TRNG
2. SHA-256(entropy_bytes ‖ timestamp_le8) = 32-byte hash
3. ECDSA sign(hash, private_key) = 64-byte raw sig (r‖s)
4. JSON POST → Nginx → Backend
5. Backend validates schema
6. Backend checks timestamp freshness (±60s)
7. Backend resolves public key (cache → DB → payload)
8. ECDSA verify(hash, signature, public_key) — MUST pass
9. INSERT into entropy_records (unique constraint = replay defence)
10. io.emit('entropy:new', record) → all WebSocket clients
11. Frontend renders record with verified badge
```

---

## Module Responsibilities

| Module         | Responsibility                                                     |
|----------------|--------------------------------------------------------------------|
| `entropy.c`    | Collect raw entropy (TRNG + future camera/ADC)                     |
| `crypto.c`     | SHA-256 hashing + **sign_hash() abstraction boundary**            |
| `storage.c`    | NVS keypair persistence (encrypted partition)                      |
| `network.c`    | Wi-Fi join, SNTP sync, HTTPS POST                                  |
| `verifier.js`  | Node.js ECDSA verification (secp256r1, DER conversion)             |
| `entropyService.js` | Business logic: validate → verify → persist → broadcast       |
| `websocket/`   | Socket.IO lifecycle and event management                           |
| `routes/`      | HTTP request parsing and response formatting                       |
| `db/`          | PostgreSQL pool, migrations, schema                                |
| `App.jsx`      | React root – tab routing, WebSocket connection                     |
| `useEntropy.js`| Custom hook – Socket.IO state management + REST history load       |

---

## Scalability Design

- **Backend is stateless** (except DB) – can be horizontally scaled
- **Public key cache** in memory per instance; DB is source of truth
- **Postgres** handles concurrent writes with unique index
- **Socket.IO** can be clustered with Redis adapter (future)
- **Multiple devices** supported via `device_id` routing
- **Nginx** handles TLS termination, load balancing, rate limiting

---

## Future Extensions

| Feature                      | Where to change              |
|------------------------------|------------------------------|
| ATECC608A hardware signing   | `crypto.c` – `sign_hash()` only |
| Camera entropy source        | `entropy.c` – `entropy_collect()` |
| Blockchain anchoring         | `entropyService.js` – post-insert hook |
| Merkle tree batching         | New `merkle.js` service       |
| Redis WebSocket clustering   | `websocket/index.js` + adapter |
| Device JWT auth              | New `auth` middleware          |
