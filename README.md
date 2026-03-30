# ENIGMA

> Real-time entropy generation, cryptographic signing, and verification system.
>
> **Chain of Trust:** `Entropy → Hash → Signature → Verification → Storage → Visualization`

---

## Architecture

```
ESP32-S3 (Edge)                Backend (Node.js)          Frontend (React)
────────────────               ──────────────────         ────────────────
TRNG entropy                   Signature verify           WebSocket client
SHA-256 hash        HTTPS      Timestamp check            Live feed
ECDSA sign          POST ────► DB insert                  History table
NVS key store                  WS broadcast ──────────►   Verified badge
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system diagram.

---

## Project Structure

```
ENIGMA/
├── firmware/                   # ESP32-S3 firmware (ESP-IDF 5.x)
│   ├── main/
│   │   ├── main.c              # Application entry point
│   │   ├── entropy.c/h         # Hardware TRNG collection
│   │   ├── crypto.c/h          # SHA-256 + ECDSA (sign_hash abstraction)
│   │   ├── storage.c/h         # NVS encrypted key persistence
│   │   ├── network.c/h         # Wi-Fi + SNTP + HTTPS POST
│   │   └── config.h            # All compile-time configuration
│   ├── CMakeLists.txt
│   └── sdkconfig.defaults
│
├── backend/                    # Node.js + Express + Socket.IO
│   ├── src/
│   │   ├── index.js            # Server entry point
│   │   ├── config.js           # Environment configuration
│   │   ├── logger.js           # Winston structured logging
│   │   ├── metrics.js          # Prometheus metrics
│   │   ├── routes/
│   │   │   └── entropy.js      # REST endpoints
│   │   ├── services/
│   │   │   ├── verifier.js     # ECDSA verification (secp256r1)
│   │   │   └── entropyService.js# Business logic + WS broadcast
│   │   ├── middleware/
│   │   │   └── validate.js     # Input validation rules
│   │   ├── websocket/
│   │   │   └── index.js        # Socket.IO server
│   │   └── db/
│   │       ├── pool.js         # PostgreSQL connection pool
│   │       └── migrate.js      # Schema migration script
│   ├── tests/
│   │   └── entropy.test.js
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                   # React + Vite + Tailwind
│   ├── src/
│   │   ├── App.jsx             # Root component + tab routing
│   │   ├── hooks/
│   │   │   └── useEntropy.js   # WebSocket + REST state hook
│   │   └── components/
│   │       ├── ConnectionBadge.jsx
│   │       ├── StatsBar.jsx
│   │       ├── LiveFeed.jsx
│   │       ├── HistoryTable.jsx
│   │       ├── EntropyCard.jsx
│   │       └── VerificationBadge.jsx
│   ├── Dockerfile
│   └── package.json
│
├── database/
│   └── schema.sql              # Full PostgreSQL schema
│
├── nginx/
│   ├── nginx.conf              # Main Nginx config
│   └── conf.d/
│       └── enigma.conf         # Virtual host + upstream config
│
├── docs/
│   ├── ARCHITECTURE.md         # System design + data flow
│   ├── API.md                  # Full API contract
│   ├── SECURITY.md             # Security model + checklist
│   └── HARDWARE_UPGRADE.md     # ATECC608A migration guide
│
├── docker-compose.yml
└── .gitignore
```

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
