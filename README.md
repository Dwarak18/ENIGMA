# ENIGMA

> **Cryptographically Secure Entropy Logging & Verification System**
>
> Real-time entropy generation, AES-128 encryption, SHA-256 hashing, and ECDSA signing with immutable blockchain-anchored storage.
>
> **Chain of Trust:** `Image Capture → Entropy Extract → AES Encrypt → SHA-256 Hash → ECDSA Sign → Blockchain Anchor → Verify`

---

## 🎯 System Overview

**ENIGMA** is a full-stack system for capturing, conditioning, encrypting, and verifying entropy with a complete audit trail:

1. **Capture:** Laptop camera or external USB camera feeds entropy-rich image data
2. **Extract:** Backend extracts pseudo-random bitstreams via LSB (Least Significant Bit) analysis
3. **Condition:** ESP32-S3 firmware hashes raw bitstream using SHA-256 via mbedTLS
4. **Encrypt:** AES-128-ECB encryption (hardware-accelerated on ESP32-S3)
5. **Derive:** SHA-256(AES_key || timestamp) → 32-byte integrity hash
6. **Sign:** ECDSA/P-256 signature generation and verification
7. **Chain:** Blockchain-anchored records with cryptographic chaining for tamper detection
8. **Verify:** On-demand verification API to detect any historical tampering

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ENIGMA PIPELINE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Frontend (React)          Backend (Node.js/Express)  Firmware       │
│  ─────────────────         ──────────────────────────  ──────────    │
│                                                                       │
│  • Camera capture    →  Image validation    →  ESP32-S3 crypto      │
│  • Live dashboard    →  Entropy extraction  →  • SHA-256 (MbedTLS)  │
│  • History table     →  AES encryption      →  • AES-128-ECB        │
│  • Verification UI   →  Signature verify    →  • ECDSA/P-256        │
│                    →  DB insert            →  • SNTP time-sync      │
│                    →  WS broadcast         →  • NVS persistence     │
│                    →  Blockchain anchor    →                        │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     DATA FLOW (Request Cycle)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ 1. Firmware POSTs to backend:                                        │
│    POST /api/v1/entropy {                                            │
│      device_id,           # ESP32 device identifier                  │
│      timestamp,           # SNTP-synchronized UTC timestamp           │
│      entropy_hash,        # SHA-256(bitstream)                       │
│      signature,           # ECDSA signature over hash                │
│      public_key,          # Uncompressed P-256 (first POST only)     │
│      image_encrypted,     # AES-encrypted image bits (optional)      │
│      image_hash           # SHA-256 of original image bits           │
│    }                                                                  │
│                                                                       │
│ 2. Backend verification:                                             │
│    • Validate timestamp freshness (MAX_TIMESTAMP_SKEW_S = 60s)       │
│    • Resolve device public key (cache + DB lookup)                   │
│    • Verify ECDSA signature (secp256r1 DER → SPKI conversion)        │
│    • Check replay protection (unique device_id/timestamp/hash)       │
│    • Insert record into PostgreSQL with blockchain status            │
│                                                                       │
│ 3. Real-time broadcast:                                              │
│    • Socket.IO 'entropy:new' event to all connected clients          │
│    • System stats broadcast (5s interval)                            │
│    • Device status/presence tracking                                 │
│                                                                       │
│ 4. Blockchain anchoring (async):                                     │
│    • Hardhat local RPC submits anchors to smart contract             │
│    • Immutable hash chain prevents tampering                         │
│    • Status tracked in 'pending_blockchain' table                    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Project Structure (Full)

---

## Quick Start

### 1. Backend + Database

```bash
cd backend
cp .env.example .env
# Edit .env – set POSTGRES_PASSWORD, CORS_ORIGINS, etc.

npm install
npm run migrate   # create tables
npm run dev       # start with nodemon (dev)
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev       # Vite dev server on :5173
```

### 3. Docker (all services)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env

docker compose up -d --build
docker compose exec backend node src/db/migrate.js
```

Services:
- Frontend: http://localhost (Nginx)
- Backend API: http://localhost/api/v1
- WebSocket: ws://localhost/socket.io

### 4. Firmware (ESP-IDF 5.x)

```bash
cd firmware

# Edit main/config.h:
#   WIFI_SSID, WIFI_PASSWORD, BACKEND_HOST, DEVICE_ID

idf.py set-target esp32s3
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

> For production: enable flash encryption, secure boot, and NVS encryption
> in `sdkconfig.defaults` before flashing. See [docs/SECURITY.md](docs/SECURITY.md).

---

## API Summary

| Method | Endpoint                        | Description              |
|--------|---------------------------------|--------------------------|
| POST   | `/api/v1/entropy`               | Submit signed entropy    |
| GET    | `/api/v1/entropy/latest`        | Most recent record       |
| GET    | `/api/v1/entropy/history?limit` | Paginated history        |
| GET    | `/health`                       | Health check             |
| WS     | `entropy:new`                   | Real-time broadcast      |

Full contract: [docs/API.md](docs/API.md)

---

## Hardware Upgrade Path (ATECC608A)

The signing logic is isolated behind the `sign_hash()` function in
`firmware/main/crypto.c`. Upgrading to a hardware secure element requires
changing **only that function**. Backend, frontend, and database are
unaffected.

See [docs/HARDWARE_UPGRADE.md](docs/HARDWARE_UPGRADE.md) for step-by-step instructions.

---

## Running Tests

```bash
cd backend
npm test
```

Tests require a running PostgreSQL instance at the URL in `DATABASE_URL`.

---

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model,
mitigations, and pre-production checklist.

---

## Tech Stack

| Layer    | Technology                                      |
|----------|-------------------------------------------------|
| Firmware | ESP-IDF 5.x · mbedTLS · FreeRTOS                |
| Backend  | Node.js 20 · Express · Socket.IO · PostgreSQL   |
| Frontend | React 18 · Vite · Tailwind CSS · Socket.IO      |
| Infra    | Docker · Nginx · Let's Encrypt · Prometheus     |
| Crypto   | secp256r1 · ECDSA · SHA-256                     |
