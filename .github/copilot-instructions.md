# ENIGMA Copilot Instructions

## Build, test, and lint commands

### Full stack (Docker)
```bash
cp backend/.env.example backend/.env
docker compose up -d --build
docker compose exec backend node src/db/migrate.js
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

### Backend API (`backend/`)
```bash
npm install
npm run migrate
npm run dev
npm start
```

### Smart contracts (repo root)
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

### Current test reality
- Hardhat is the only wired test runner in `package.json`.
- `backend/tests/entropy.test.js` exists, but backend `package.json` does not define a test script for it.
- Frontend has build/lint scripts, but no unit/integration test runner script.

## High-level architecture

ENIGMA is a Node/Express + React + PostgreSQL + local Hardhat system, with ESP32/simulator entropy producers and an optional USB serial listener.

1. **Runtime composition**  
   `backend/src/server.js` hosts REST + Socket.IO, `frontend/src/App.jsx` is the realtime UI state hub, and Docker Compose wires postgres, blockchain, backend, frontend, firmware simulator, and device-listener.

2. **Entropy ingest pipeline**  
   `POST /api/v1/entropy` (and `/api/v1/entropy/data`) -> validation middleware -> `controllers/data.handlePostData()` -> `entropyService.processEntropy()` for skew checks, key resolution, signature verification, DB insert, replay defense, and websocket `entropy:new`.

3. **Device trust/presence pipeline**  
   `tools/device_listener/listener.py` detects serial devices, runs challenge-response in `handshake.py`, then posts `/api/v1/system/device-status`; backend watchdog/TRNG state updates are managed in `entropyService`.

4. **Realtime dashboard pipeline**  
   `backend/src/websocket/index.js` emits `system:stats`, `trng:state`, `device:status`, `entropy:new`, and `image:stream`; `frontend/src/App.jsx` consumes and fans these into pages.

5. **Image stream pipeline (two ingress paths)**  
   Frontend camera capture hits `POST /api/v1/image-streams/capture` (`imageStreamService.captureLaptopImage()`), while ESP32 chunk streams are accepted via websocket `image:chunk` and reassembled by `processImageChunk()`.

6. **Blockchain anchoring pipeline**  
   Accepted entropy hashes are queued via `services/blockchain.runAsyncStore()`, retried in `pending_blockchain`, and submitted to `RecordStorage.storeRecord(...)` on local Hardhat RPC.

7. **Persistence model**  
   `database/schema.sql` defines `devices`, `entropy_records`, `image_streams`, and `pending_blockchain`; replay prevention is the unique `(device_id, timestamp, entropy_hash)` index.

## Key conventions and project-specific patterns

- Active backend runtime is CommonJS Node/Express at `backend/src/server.js`; `backend/src/index.js` is not the API server entrypoint.
- Keep API compatibility for `POST /api/v1/entropy`, `POST /api/v1/entropy/data` (alias), and `POST /api/v1/image-streams/capture`.
- Signature contract is strict: `signature` is raw `r||s` hex (128 chars), `public_key` is uncompressed P-256 hex (130 chars, `04||X||Y`), and backend converts to DER/SPKI in `backend/src/services/verifier.js`.
- Timestamp freshness is enforced by `MAX_TIMESTAMP_SKEW_S` (default 60 seconds), returning `STALE_TIMESTAMP` on violation.
- Error payloads are contract-relevant and usually shaped as `{ ok: false, code, message }` (for example `VALIDATION_ERROR`, `UNKNOWN_DEVICE`, `INVALID_SIGNATURE`, `REPLAY_DETECTED`).
- Online/offline device state and TRNG state are driven by in-memory watchdog state in `entropyService`, not by DB `last_seen` timestamps alone.
- Frontend/backend URL wiring uses both `VITE_BACKEND_URL` and `VITE_API_URL`; keep them aligned when changing environments.
- Blockchain defaults are local-first (`http://127.0.0.1:8545`) with retry persistence in `pending_blockchain`, not fire-and-forget chain writes.
- Device listener handshake and backend verifier must stay aligned on P-256 + SHA-256 semantics.
- Firmware build surface is defined in `firmware/main/CMakeLists.txt` and currently includes `main.c`, `uart.c`, `crypto.c`, `wifi.c`, `ntp.c`, and `utils.c`.
