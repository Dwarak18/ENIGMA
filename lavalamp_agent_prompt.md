# ENIGMA Agent Prompt - Hardware Entropy Pipeline (Repo-Aligned)

> **Project codename:** `ENIGMA`  
> **Target agent:** Copilot / Codex / Gemini  
> **Scope:** Backend + Firmware + Smart Contract + Storage integration  
> **Hard rule:** Do **not** modify frontend UI/UX/design/camera-capture code.

---

## 1) Objective

Implement and stabilize the hardware-rooted entropy pipeline using this repository's **actual** runtime and interfaces:

1. Frontend captures frames (already implemented).
2. Backend stores image-stream metadata (`POST /api/v1/image-streams/capture`).
3. ESP32/simulator sends signed entropy payload (`POST /api/v1/entropy`).
4. Backend validates signature + timestamp, enforces replay guard, stores record, and anchors hash to local Hardhat.

---

## 2) Non-negotiable repository constraints

1. Backend runtime is **Node.js + Express (CommonJS)** at `backend/src/server.js` (port 3000).  
   Do not switch implementation to FastAPI as the active runtime.
2. Keep existing API compatibility:
   - `POST /api/v1/entropy`
   - `POST /api/v1/entropy/data` (alias)
   - `POST /api/v1/image-streams/capture`
3. Blockchain path must stay local Hardhat:
   - RPC: `http://127.0.0.1:8545`
   - Contract: `contracts/RecordStorage.sol`
   - Deploy script: `scripts/deploy.js`
   - Config: `hardhat.config.js` (ESM, Solidity `0.8.20`)
4. Anchor **integrity hash**, not raw key material.  
   Never expose `aes_key` in frontend/API responses.
5. Error responses should preserve existing shape:  
   `{ ok: false, code, message }`
6. Replay protection must remain intact:  
   unique `(device_id, timestamp, entropy_hash)`.
7. Do not add public-chain/cloud assumptions for this path.
8. Do not modify frontend files.

---

## 3) Ground truth architecture to reuse

- **Entropy ingest:** `backend/src/routes/entropy.js` -> `entropyService.processEntropy()`
- **Image capture:** `backend/src/routes/imageStreams.js` -> `imageStreamService.captureLaptopImage()`
- **Blockchain anchoring:** `backend/src/services/blockchain.js` -> `storeRecord(deviceId, timestamp, entropyHash)`
- **Persistence:** `database/schema.sql` (`devices`, `entropy_records`, `image_streams`, `pending_blockchain`)
- **Firmware build:** `firmware/main/CMakeLists.txt` with ESP-IDF C sources

---

## 4) Required work modules

### Module A - Firmware / simulator output contract

Ensure firmware (or simulator) emits payloads compatible with backend validation:

```json
{
  "device_id": "esp32-001",
  "timestamp": 1715000000,
  "entropy_hash": "64-char-hex",
  "signature": "128-char-hex",
  "public_key": "130-char-hex-optional-after-first-registration",
  "rtc_time": "HH:MM:SS",
  "aes_ciphertext": "optional-hex",
  "aes_iv": "optional-hex",
  "image_encrypted": "optional-hex",
  "image_iv": "optional-hex",
  "image_hash": "optional-hex"
}
```

Firmware-side requirements:
- Timestamp freshness (server enforces skew window).
- Signature must be raw ECDSA `r||s` hex (64 bytes / 128 chars).
- Public key must be uncompressed P-256 hex (130 chars, `04||X||Y`).

### Module B - Backend entropy pipeline hardening

Use existing backend flow and improve where needed, without breaking contracts:

1. Validate request shape and crypto fields.
2. Verify signature against known/resolved public key.
3. Enforce timestamp window + replay guard.
4. Persist record to `entropy_records`.
5. Broadcast `entropy:new`.
6. Queue/submit blockchain anchor (`pending_blockchain` + tx hash updates).

### Module C - Blockchain integration (local only)

Use existing `RecordStorage` contract integration:

- Keep `storeRecord(deviceId, timestamp, entropyHash)`.
- Keep local signer (`PRIVATE_KEY`) and `CONTRACT_ADDRESS` config.
- Handle unavailable/misconfigured blockchain with explicit error logging and clear status.
- Preserve DB write behavior in `pending_blockchain` on success/failure.

### Module D - Image stream integration (backend-only)

Keep camera ingestion backend-compatible:

- Continue accepting `POST /api/v1/image-streams/capture`.
- Persist stream metadata to `image_streams`.
- Keep current response shape intact (`{ ok: true, data: ... }`).
- Optional enhancement: include backend-computed `next_capture_in` in response **without requiring frontend code changes**.

### Module E - Storage/caching policy

Default behavior in this repo:

- Image persistence + metadata in existing backend paths/DB.
- Local filesystem capture path is valid for development.

Optional behavior (feature-flagged, not mandatory):

- MinIO/S3-compatible object storage.
- Redis short-lived cache.

Do not make MinIO/Redis hard dependencies unless explicitly requested.

---

## 5) Explicit do/don't rules

### Do

- Reuse existing services and routes before introducing new ones.
- Keep Node/Express CommonJS patterns in backend.
- Keep Hardhat integration local.
- Keep contract and script names aligned with repo (`RecordStorage`, `scripts/deploy.js`).
- Keep API and DB contracts backward-compatible.

### Don't

- Do not introduce `POST /api/generate-key` as the primary path (not current API contract).
- Do not replace backend runtime with Python/FastAPI.
- Do not store raw AES keys on-chain.
- Do not change frontend components/pages/styles/timers directly.

---

## 6) Environment variables (repo-aligned baseline)

Use/extend existing backend env names:

```env
# Backend
PORT=3000
DATABASE_URL=postgresql://enigma:changeme@localhost:5432/enigma_db
MAX_TIMESTAMP_SKEW_S=60

# Blockchain (local Hardhat)
RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=<hardhat-local-account-key>
CONTRACT_ADDRESS=<deployed-recordstorage-address>
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_RETRY_INTERVAL_MS=30000
BLOCKCHAIN_RETRY_BATCH_SIZE=20

# Optional serial bridge
ESP32_PORT=COM3
ESP32_BAUD=115200

# Optional object storage/cache (only if enabled)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=enigma-images
REDIS_URL=redis://localhost:6379
```

---

## 7) Execution checklist for the agent

- [ ] Confirm backend runtime/entrypoint remains `backend/src/server.js`.
- [ ] Confirm entropy endpoint contract stays `/api/v1/entropy` (+ `/data` alias).
- [ ] Ensure firmware/simulator payload format matches backend validators.
- [ ] Ensure signature verification path remains strict (`r||s`, P-256 public key).
- [ ] Keep timestamp skew and replay detection behavior intact.
- [ ] Ensure blockchain anchoring uses `RecordStorage.storeRecord(...)`.
- [ ] Ensure `pending_blockchain` status updates remain consistent.
- [ ] Keep image capture route behavior backward compatible.
- [ ] Keep frontend untouched.
- [ ] Run local Hardhat + backend integration smoke flow with sample payload.

---

## 8) Success criteria

1. A valid signed payload to `POST /api/v1/entropy` is accepted and stored.
2. Replay and invalid-signature payloads are rejected with meaningful `code`.
3. Blockchain tx hash is produced for accepted records when blockchain is enabled.
4. `GET /api/v1/entropy/anchored` returns confirmed anchors.
5. Camera capture path still works via `POST /api/v1/image-streams/capture`.

---

*End of ENIGMA Agent Prompt - Version 2.0 (repo-aligned)*
