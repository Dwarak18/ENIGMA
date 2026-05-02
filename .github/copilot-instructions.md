# ENIGMA Copilot Instructions

## Build, test, and lint commands

### Full stack (Docker)
```bash
docker compose up -d --build
docker compose ps
docker compose down
```

### Frontend (`frontend/`)
```bash
npm install
npm run dev
npm run build
npm run lint
```

### Backend API (`backend/`, active runtime is Node/Express)
```bash
npm install
npm run dev
npm start
```

### Smart contracts (repo root, Hardhat)
```bash
npx hardhat compile
npx hardhat test
```

Single test file:
```bash
npx hardhat test test/<file>.js
```

### Firmware simulator (`firmware/`)
```bash
pip install -r requirements.txt
python simulate.py
```

### USB/serial device listener (`tools/device_listener/`)
```bash
pip install -r requirements.txt
python listener.py
```

### Current testing reality
- `backend/tests/entropy.test.js` exists, but backend `package.json` does not currently wire a test runner/dependencies for it.
- Frontend `package.json` has no test script.

## High-level architecture

ENIGMA currently runs as a Node/Express + React + Postgres + local Hardhat stack, with optional firmware simulator and USB device listener.

1. **Entropy ingest flow**  
   ESP32/simulator posts to `POST /api/v1/entropy` (`backend/src/routes/entropy.js`) → validation middleware → `entropyService.processEntropy()` for timestamp window checks, public-key resolution, ECDSA verification, DB insert, replay guard, and `entropy:new` broadcast.

2. **Camera capture flow**  
   Frontend camera page (`frontend/src/pages/CamerasPage.jsx`) captures laptop frames and calls `POST /api/v1/image-streams/capture` → backend `imageStreamService.captureLaptopImage()` encrypts image bytes, stores metadata in `image_streams`, and returns preview/hash artifacts for UI.

3. **Realtime dashboard flow**  
   Socket.IO (`backend/src/websocket/index.js`) emits `system:stats`, `trng:state`, `device:status`, `entropy:new`, and `image:stream`; `frontend/src/App.jsx` is the main state hub and fans data into page components.

4. **Device presence + trust flow**  
   `tools/device_listener/listener.py` detects serial devices, runs challenge-response handshake (`handshake.py`), then posts `/api/v1/system/device-status`; backend watchdog state (not DB timestamps) is treated as online/offline source of truth.

5. **Blockchain anchoring flow**  
   Backend submits anchors via `backend/src/services/blockchain.js` (local Hardhat RPC), persists anchor status in `pending_blockchain`, and exposes status/config routes used by `frontend/src/pages/BlockchainPage.jsx`.

6. **Persistence model**  
   `database/schema.sql` defines `devices`, `entropy_records`, `image_streams`, and `pending_blockchain`; replay protection is enforced by unique `(device_id, timestamp, entropy_hash)` index.

## Key conventions and project-specific patterns

- **Trust active runtime entrypoints over older docs**: Docker and backend npm scripts run `backend/src/server.js` (CommonJS, port 3000). `backend/app/*.py` and some docs still describe a FastAPI/port-8000 path and are not the deployed default.
- **Signature format contract is strict**: device signature is raw `r||s` hex (128 chars), public key is uncompressed P-256 hex (130 chars, `04||X||Y`), and backend converts to DER/SPKI in `services/verifier.js`.
- **API error shape is meaningful**: routes generally return `{ ok: false, code, ... }` with codes like `VALIDATION_ERROR`, `STALE_TIMESTAMP`, `UNKNOWN_DEVICE`, `INVALID_SIGNATURE`, `REPLAY_DETECTED`.
- **Timestamp freshness is enforced**: payload timestamp must be within `MAX_TIMESTAMP_SKEW_S` (default 60s) or request is rejected.
- **Realtime status semantics**: online/offline in system endpoints/UI is derived from in-memory watchdog state from `entropyService`, not from `devices.last_seen` alone.
- **Frontend uses two backend env names**: `VITE_BACKEND_URL` (App/socket/history paths) and `VITE_API_URL` (`useEnigmaAPI`). Keep both aligned when changing environments.
- **Firmware build surface is explicit**: `firmware/main/CMakeLists.txt` currently builds `main.c`, `uart.c`, `crypto.c`, `rtc.c`, `utils.c`; `network.c`/`wifi.c`/`ntp.c` exist but are not currently part of that build target.
- **TRNG blockchain constraints (from repo agent config)**: prefer local Hardhat (`localhost:8545`) and hardware-backed signing workflows for ESP32 pipeline work; avoid introducing public-chain/cloud assumptions in this repo path.
