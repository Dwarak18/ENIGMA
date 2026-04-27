# 🤖 AGENT TASK PROMPT — Secure Image Blockchain System
# Full Audit + Modification + Blockchain Agent Integration
# Version: 1.0 | Target: Autonomous Coding Agent (Claude Code / similar)

---

## AGENT IDENTITY & OPERATING RULES

You are a senior embedded + blockchain + backend engineer acting as an autonomous agent.
You have full read/write access to the repository.

### Mandatory rules before any action:
1. **DISCOVER BEFORE MODIFYING** — read every relevant file before changing anything.
2. **ONE CHANGE AT A TIME** — never batch-modify unrelated files in a single step.
3. **VERIFY AFTER EVERY CHANGE** — compile/lint/test after each modification.
4. **NEVER DELETE** — only replace or refactor. Archive removed code in comments with `// [REMOVED: reason]`.
5. **REPORT ALL FINDINGS** — log every discovery, change, and decision in `AGENT_LOG.md`.
6. **IF UNCERTAIN** — stop and write the ambiguity to `AGENT_BLOCKED.md` instead of guessing.

---

## REPOSITORY CONTEXT (What already exists)

The repository contains a fully scaffolded but partially broken/incomplete system:

```
/project-root/
├── firmware/          # ESP32-S3 (ESP-IDF). Runs isolated in Docker.
├── backend/           # Node.js / Express
├── frontend/          # React + TailwindCSS
├── contracts/         # Solidity (Hardhat) — Sepolia testnet
├── docker/            # Docker + docker-compose for all services
└── AGENT_LOG.md       # YOU must create and maintain this file
```

### Hardware Reality (CRITICAL CONSTRAINT):
- **Only ESP32-S3 DevKit is used**
- **NO ATECC608A** (secure element) — was planned, not present
- **NO DS3231** (RTC module) — was planned, not present
- All crypto, timing, and randomness must use **ESP32-S3 on-chip resources only**

---

## PHASE 0 — DISCOVERY (Do this first, touch nothing)

### 0.1 — Full codebase scan

Run these commands and log all output to `AGENT_LOG.md`:

```bash
# Repository structure
find . -type f | grep -v node_modules | grep -v .git | grep -v build | grep -v __pycache__ | sort

# Count lines per file
find . -type f \( -name "*.c" -o -name "*.h" -o -name "*.js" -o -name "*.sol" \
  -o -name "*.jsx" -o -name "*.ts" -o -name "*.json" -o -name "*.yml" \) \
  | grep -v node_modules | grep -v build \
  | xargs wc -l 2>/dev/null | sort -rn | head -40

# Search for all ATECC608A references
grep -rn --include="*.c" --include="*.h" --include="*.cmake" \
  "ATECC\|atecc\|608a\|608A\|secure_element" . 2>/dev/null

# Search for all DS3231 references
grep -rn --include="*.c" --include="*.h" \
  "DS3231\|ds3231\|RTC\|rtc\|i2c_rtc" . 2>/dev/null

# Search for hardcoded keys or secrets
grep -rn --include="*.c" --include="*.h" --include="*.js" \
  "hardcode\|0x00010203\|PRIVATE_KEY\s*=\s*['\"][^$]" . 2>/dev/null

# Docker services defined
cat docker/docker-compose.yml 2>/dev/null || cat docker-compose.yml 2>/dev/null

# Package dependencies
cat backend/package.json 2>/dev/null
cat contracts/package.json 2>/dev/null

# Environment files (list only, never print values)
find . -name ".env*" -not -name ".env.example" | grep -v node_modules

# Check if contract is already deployed
grep -rn "CONTRACT_ADDRESS" . --include="*.env*" --include="*.env.example" 2>/dev/null
```

### 0.2 — Build discovery report

Create `AGENT_LOG.md` with this structure:

```markdown
# AGENT LOG

## Discovery Report — [timestamp]

### Files Found
[list]

### ATECC608A References Found
[list file:line]

### DS3231 References Found  
[list file:line]

### Hardcoded Secrets Found
[list — values redacted]

### Docker Services
[list]

### Contract Deployment Status
[deployed / not deployed / unknown]

### Blockers Identified
[list]
```

---

## PHASE 1 — FIRMWARE AUDIT & MODIFICATION

### 1.1 — Read all firmware files first

```bash
cat firmware/main/main.c
cat firmware/main/camera.c 2>/dev/null || echo "NOT FOUND"
cat firmware/main/aes_gcm.c 2>/dev/null || echo "NOT FOUND"
cat firmware/main/http_client.c 2>/dev/null || echo "NOT FOUND"
cat firmware/CMakeLists.txt
cat firmware/sdkconfig 2>/dev/null | grep -E "CONFIG_MBEDTLS|CONFIG_CAMERA|CONFIG_HTTP|CONFIG_I2C|CONFIG_ATECC"
```

### 1.2 — Remove ATECC608A

**Find and eliminate:**
- Any `#include` referencing ATECC, esp_cryptoauth, or cryptoauthlib
- Any function calls: `atcab_*`, `atecc_*`, `cryptoauth_*`
- Any I2C initialization specifically for ATECC608A
- Any CMakeLists.txt REQUIRES entries for `esp-cryptoauthlib` or `cryptoauthlib`

**Replace with:**
```c
// AES key management without ATECC608A:
// Use ESP32-S3 eFuse for key storage OR load from NVS
// For this implementation: load key from NVS partition (provisioned at flash time)
// Key is provisioned once via idf.py nvs_partition_gen

#include "nvs_flash.h"
#include "nvs.h"

esp_err_t load_aes_key_from_nvs(uint8_t key_out[32]) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open("secure_cfg", NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) return err;

    size_t key_len = 32;
    err = nvs_get_blob(nvs_handle, "aes_key", key_out, &key_len);
    nvs_close(nvs_handle);

    if (err != ESP_OK || key_len != 32) {
        return ESP_ERR_NOT_FOUND;
    }
    return ESP_OK;
}
```

**NVS key provisioning command** (run once at setup):
```bash
# Generate a 32-byte random key
python3 -c "import secrets; print(secrets.token_hex(32))" > key.txt

# Write to ESP32 NVS via esptool (do this once per device)
# Create nvs_data.csv:
echo "key,namespace,type,value" > nvs_data.csv
echo "aes_key,secure_cfg,blob,$(cat key.txt)" >> nvs_data.csv

# Generate NVS partition binary
python3 $IDF_PATH/components/nvs_flash/nvs_partition_generator/nvs_partition_gen.py \
  generate nvs_data.csv nvs_key_partition.bin 0x6000

# Flash NVS partition to correct offset (check partition table)
esptool.py --port /dev/ttyUSB0 write_flash 0x9000 nvs_key_partition.bin
```

### 1.3 — Remove DS3231 / RTC

**Find and eliminate:**
- Any `#include` referencing ds3231, i2c_rtc, or external RTC
- Any `i2c_master_init()` calls specifically for RTC
- Any `ds3231_get_time()` or similar function calls

**Replace with ESP32-S3 internal time:**
```c
#include "esp_sntp.h"
#include "esp_timer.h"
#include <sys/time.h>

// Initialize SNTP time sync (call once after WiFi connects)
void time_sync_init(void) {
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_setservername(1, "time.google.com");
    esp_sntp_init();

    // Wait for sync (max 10 seconds)
    int retry = 0;
    while (sntp_get_sync_status() == SNTP_SYNC_STATUS_RESET && retry < 20) {
        vTaskDelay(pdMS_TO_TICKS(500));
        retry++;
    }
}

// Get millisecond timestamp
int64_t get_unix_timestamp_ms(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (int64_t)(tv.tv_sec) * 1000LL + (tv.tv_usec / 1000);
}
```

### 1.4 — Replace any hardware RNG with ESP32-S3 hardware RNG

**If you find any software PRNG (rand(), srand(), custom LCG):**

Replace with:
```c
#include "esp_random.h"

// Use ESP32-S3 hardware RNG — cryptographically secure
void generate_random_iv(uint8_t iv_out[12]) {
    esp_fill_random(iv_out, 12);
}
```

### 1.5 — Verify AES mode is GCM, not ECB

```bash
grep -n "MBEDTLS_AES_ECB\|ecb\|ECB\|createCipheriv.*aes.*ecb" firmware/main/*.c
```

If ECB found → replace with AES-256-GCM. The correct mbedTLS call is:
```c
mbedtls_gcm_crypt_and_tag(
    &gcm, MBEDTLS_GCM_ENCRYPT, plaintext_len,
    iv, 12,        // 12-byte IV
    NULL, 0,       // no AAD
    plaintext,
    ciphertext,
    16, tag        // 16-byte auth tag
);
```

### 1.6 — Update CMakeLists.txt

After removing ATECC608A and DS3231, ensure CMakeLists.txt REQUIRES only:
```cmake
REQUIRES 
    esp_http_client 
    mbedtls 
    esp_camera 
    nvs_flash 
    esp_wifi 
    esp_event 
    esp_netif 
    esp_sntp
    esp_timer
    # REMOVED: esp-cryptoauthlib (ATECC608A)
    # REMOVED: any i2c_rtc component (DS3231)
```

### 1.7 — Docker firmware build verification

```bash
# Verify Docker builds cleanly after changes
cd docker/
docker-compose build firmware 2>&1 | tail -30

# If no firmware service:
docker build -f docker/Dockerfile.firmware . 2>&1 | tail -30

# Check for compile errors specifically
docker-compose run --rm firmware idf.py build 2>&1 | grep -E "error:|warning:|undefined"
```

**Log all warnings. Fix all errors. Document warnings in AGENT_LOG.md.**

---

## PHASE 2 — BACKEND AUDIT & FIXES

### 2.1 — Read all backend files

```bash
cat backend/src/app.js
cat backend/src/services/blockchainService.js 2>/dev/null
cat backend/src/services/hashService.js 2>/dev/null
cat backend/src/services/ipfsService.js 2>/dev/null
cat backend/src/services/aiService.js 2>/dev/null
cat backend/src/controllers/imageController.js 2>/dev/null
cat backend/src/controllers/verifyController.js 2>/dev/null
cat backend/.env.example 2>/dev/null
```

### 2.2 — Verify AES decryption matches firmware

The backend must decrypt using the exact same parameters the firmware encrypts with:
- Algorithm: `aes-256-gcm`
- Key size: 32 bytes
- IV size: 12 bytes
- Tag size: 16 bytes

**Check in imageController.js:**
```javascript
// This must match exactly:
const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, ivBuf);
decipher.setAuthTag(tagBuf);  // 16 bytes
```

If any mismatch found → fix to match the above.

### 2.3 — Check what is hashed

The SHA-256 hash must be computed over the **raw ciphertext bytes**, NOT:
- Not the base64 string
- Not the decrypted plaintext
- Not JSON stringified payload

Correct:
```javascript
const imageHash = crypto.createHash("sha256").update(ciphertextBuffer).digest("hex");
```

Fix if wrong.

### 2.4 — Verify error handling completeness

Check every async function in controllers and services. Every `await` must be inside try/catch.
Bare `await` without error handling is a crash vector. Fix any found.

Pattern to search for:
```bash
grep -n "await " backend/src/controllers/*.js backend/src/services/*.js \
  | grep -v "try\|catch" | head -20
# This is not perfect but surfaces unguarded awaits in context — review each
```

### 2.5 — Verify .env.example is complete

Ensure `.env.example` contains ALL required variables (with placeholder values):

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/imagechain
INFURA_SEPOLIA_URL=https://sepolia.infura.io/v3/YOUR_KEY
SIGNER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
CONTRACT_ADDRESS=0xDEPLOYED_CONTRACT_ADDRESS
PINATA_API_KEY=your_pinata_key
PINATA_SECRET=your_pinata_secret
ANTHROPIC_API_KEY=your_anthropic_key
AES_KEY_HEX=000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
ALLOWED_ORIGIN=http://localhost:5173
```

Add any missing variables. Never put real values here.

---

## PHASE 3 — BLOCKCHAIN AGENT INTEGRATION

This is the core new feature to build. The "blockchain agent" is a backend service that:
1. Autonomously monitors pending proof records in PostgreSQL
2. Retries failed blockchain submissions
3. Monitors submitted transactions until confirmed
4. Updates DB status accordingly
5. Exposes a verification API the frontend can poll

### 3.1 — Read existing blockchain service

```bash
cat backend/src/services/blockchainService.js
```

### 3.2 — Create the Blockchain Agent Service

Create `backend/src/services/blockchainAgent.js`:

```javascript
/**
 * Blockchain Agent
 * 
 * Autonomous agent that:
 * 1. Polls DB for 'pending' records (upload succeeded, tx not yet sent)
 * 2. Submits storeProof() transactions to Sepolia
 * 3. Monitors tx status until confirmed or failed
 * 4. Updates DB records with final status
 * 
 * Runs as a background process inside the backend container.
 */

const { ethers }   = require("ethers");
const pool         = require("../db/pool");
const logger       = require("../logger");

// ── Contract ABI (only what agent needs) ──────────────────────────────────────
const ABI = [
  "function storeProof(bytes32 imageHash, string calldata ipfsCid) external",
  "function proofExists(bytes32 imageHash) external view returns (bool)",
  "event ProofStored(bytes32 indexed imageHash, uint256 timestamp, address indexed submitter, string ipfsCid)",
];

// ── Singleton provider / contract ─────────────────────────────────────────────
let _provider = null;
let _signer   = null;
let _contract = null;

function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(process.env.INFURA_SEPOLIA_URL);
  }
  return _provider;
}

function getContract() {
  if (!_contract) {
    _signer   = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY, getProvider());
    _contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, _signer);
  }
  return _contract;
}

// ── Fetch records that need blockchain submission ──────────────────────────────
async function fetchPendingRecords() {
  const result = await pool.query(
    `SELECT id, image_hash, ipfs_cid
     FROM image_proofs
     WHERE status IN ('pending', 'uploaded')
       AND tx_hash IS NULL
       AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at ASC
     LIMIT 10`
  );
  return result.rows;
}

// ── Fetch records with tx_hash but not yet confirmed ──────────────────────────
async function fetchUnconfirmedRecords() {
  const result = await pool.query(
    `SELECT id, image_hash, tx_hash
     FROM image_proofs
     WHERE status = 'submitted'
       AND tx_hash IS NOT NULL
       AND created_at > NOW() - INTERVAL '2 hours'
     ORDER BY created_at ASC
     LIMIT 20`
  );
  return result.rows;
}

// ── Submit a single proof to Sepolia ──────────────────────────────────────────
async function submitProofTransaction(imageHashHex, ipfsCid) {
  const contract    = getContract();
  const hashBytes32 = `0x${imageHashHex}`;

  // Check if already on-chain (idempotency guard)
  const exists = await contract.proofExists(hashBytes32);
  if (exists) {
    logger.warn(`[AGENT] Hash already on-chain, skipping: ${imageHashHex}`);
    return { alreadyExists: true, txHash: null };
  }

  const tx = await contract.storeProof(hashBytes32, ipfsCid || "", {
    gasLimit: 120000,
    // Let ethers estimate gasPrice for current network conditions
  });

  logger.info(`[AGENT] Tx submitted: ${tx.hash} for hash: ${imageHashHex}`);
  return { alreadyExists: false, txHash: tx.hash };
}

// ── Mark record as submitted (tx sent, not yet confirmed) ─────────────────────
async function markAsSubmitted(recordId, txHash) {
  await pool.query(
    `UPDATE image_proofs SET tx_hash = $1, status = 'submitted' WHERE id = $2`,
    [txHash, recordId]
  );
}

// ── Mark record as confirmed ──────────────────────────────────────────────────
async function markAsConfirmed(recordId, txHash, blockNumber) {
  await pool.query(
    `UPDATE image_proofs
     SET status = 'confirmed', tx_confirmed_block = $1
     WHERE id = $2`,
    [blockNumber, recordId]
  );
  logger.info(`[AGENT] Confirmed: id=${recordId} block=${blockNumber} tx=${txHash}`);
}

// ── Mark record as failed ─────────────────────────────────────────────────────
async function markAsFailed(recordId, reason) {
  await pool.query(
    `UPDATE image_proofs SET status = 'failed', failure_reason = $1 WHERE id = $2`,
    [reason, recordId]
  );
  logger.error(`[AGENT] Failed: id=${recordId} reason=${reason}`);
}

// ── Check confirmation status of a pending tx ─────────────────────────────────
async function checkTransactionConfirmation(txHash) {
  const provider = getProvider();
  const receipt  = await provider.getTransactionReceipt(txHash);

  if (!receipt) return { confirmed: false, failed: false };

  if (receipt.status === 0) {
    return { confirmed: false, failed: true, blockNumber: receipt.blockNumber };
  }

  return { confirmed: true, failed: false, blockNumber: receipt.blockNumber };
}

// ── Submission cycle: pick up pending, submit ─────────────────────────────────
async function runSubmissionCycle() {
  const records = await fetchPendingRecords();
  if (records.length === 0) return;

  logger.info(`[AGENT] Submission cycle: ${records.length} pending records`);

  for (const record of records) {
    try {
      const { alreadyExists, txHash } = await submitProofTransaction(
        record.image_hash,
        record.ipfs_cid
      );

      if (alreadyExists) {
        // Update DB to reflect on-chain state without a new tx
        await pool.query(
          `UPDATE image_proofs SET status = 'confirmed' WHERE id = $1`,
          [record.id]
        );
      } else {
        await markAsSubmitted(record.id, txHash);
      }

      // Stagger submissions — avoid nonce conflicts
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      logger.error(`[AGENT] Submit error for id=${record.id}: ${err.message}`);
      await markAsFailed(record.id, err.message.slice(0, 200));
    }
  }
}

// ── Confirmation cycle: check submitted txs ───────────────────────────────────
async function runConfirmationCycle() {
  const records = await fetchUnconfirmedRecords();
  if (records.length === 0) return;

  logger.info(`[AGENT] Confirmation cycle: ${records.length} unconfirmed txs`);

  for (const record of records) {
    try {
      const { confirmed, failed, blockNumber } = await checkTransactionConfirmation(
        record.tx_hash
      );

      if (confirmed) {
        await markAsConfirmed(record.id, record.tx_hash, blockNumber);
      } else if (failed) {
        await markAsFailed(record.id, `Tx reverted on-chain: ${record.tx_hash}`);
      }
      // If neither: still pending on network, skip until next cycle
    } catch (err) {
      logger.error(`[AGENT] Confirm error for id=${record.id}: ${err.message}`);
    }
  }
}

// ── Main agent loop ───────────────────────────────────────────────────────────
async function startBlockchainAgent() {
  logger.info("[AGENT] Blockchain agent started");

  const SUBMISSION_INTERVAL_MS   = 15_000;  // 15 seconds
  const CONFIRMATION_INTERVAL_MS = 30_000;  // 30 seconds

  // Run immediately on start, then on interval
  await runSubmissionCycle();
  await runConfirmationCycle();

  setInterval(async () => {
    try { await runSubmissionCycle(); }
    catch (err) { logger.error("[AGENT] Submission cycle crash:", err.message); }
  }, SUBMISSION_INTERVAL_MS);

  setInterval(async () => {
    try { await runConfirmationCycle(); }
    catch (err) { logger.error("[AGENT] Confirmation cycle crash:", err.message); }
  }, CONFIRMATION_INTERVAL_MS);
}

module.exports = { startBlockchainAgent };
```

### 3.3 — DB Schema Migration for agent fields

Add to `backend/src/db/migrations/002_agent_fields.sql`:

```sql
-- Add fields required by blockchain agent

ALTER TABLE image_proofs
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploaded', 'submitted', 'confirmed', 'failed')),
  ADD COLUMN IF NOT EXISTS tx_confirmed_block BIGINT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

-- Index for agent polling query
CREATE INDEX IF NOT EXISTS idx_agent_poll
  ON image_proofs(status, created_at)
  WHERE tx_hash IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_confirm
  ON image_proofs(status, created_at)
  WHERE status = 'submitted';
```

Run:
```bash
psql $DATABASE_URL -f backend/src/db/migrations/002_agent_fields.sql
```

### 3.4 — Wire agent into app.js

In `backend/src/app.js`, add after DB pool initialization:

```javascript
const { startBlockchainAgent } = require("./services/blockchainAgent");

// Start blockchain agent ONLY when not in test environment
if (process.env.NODE_ENV !== "test") {
  startBlockchainAgent().catch((err) => {
    logger.error("[AGENT] Failed to start blockchain agent:", err.message);
    // Do NOT crash the server — agent failure is non-fatal for HTTP serving
  });
}
```

### 3.5 — Add agent status endpoint

In `backend/src/routes/`, create `agentRoutes.js`:

```javascript
const express = require("express");
const router  = express.Router();
const pool    = require("../db/pool");

// Agent status: counts by status for monitoring dashboard
router.get("/status", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM image_proofs
       GROUP BY status
       ORDER BY status`
    );

    const latest = await pool.query(
      `SELECT image_hash, status, tx_hash, tx_confirmed_block, created_at
       FROM image_proofs
       ORDER BY created_at DESC
       LIMIT 10`
    );

    return res.json({
      summary: result.rows,
      latest:  latest.rows,
    });
  } catch (err) {
    return res.status(500).json({ error: "Status query failed" });
  }
});

module.exports = router;
```

Add to `app.js`:
```javascript
const agentRoutes = require("./routes/agentRoutes");
app.use("/api/agent", agentRoutes);
```

---

## PHASE 4 — SMART CONTRACT VERIFICATION

### 4.1 — Read existing contract

```bash
cat contracts/contracts/*.sol
cat contracts/hardhat.config.js
cat contracts/scripts/deploy.js 2>/dev/null
```

### 4.2 — Check what the contract stores vs what backend sends

The `storeProof()` function must accept:
- `bytes32 imageHash` — the SHA-256 hash (as bytes32)
- `string ipfsCid` — IPFS CID string

**If the existing contract signature differs**, update BOTH:
1. The contract (requires redeployment)
2. The ABI arrays in `blockchainService.js` AND `blockchainAgent.js`

### 4.3 — Check if contract is deployed

```bash
# Check .env for CONTRACT_ADDRESS
grep "CONTRACT_ADDRESS" backend/.env 2>/dev/null

# Verify it's a real address (not placeholder)
# If placeholder → agent must deploy first
```

If NOT deployed:
```bash
cd contracts/
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
# Copy printed address → backend/.env CONTRACT_ADDRESS
```

If contract code has changed since last deploy → redeploy and update address.

### 4.4 — Verify ABI consistency

The ABI in `blockchainAgent.js` (Phase 3.2) and `blockchainService.js` must both match the deployed contract exactly.

Run:
```bash
# Extract ABI from compiled artifact
cat contracts/artifacts/contracts/ImageProof.sol/ImageProof.json \
  | python3 -c "import json,sys; abi=json.load(sys.stdin)['abi']; \
    [print(f['name'], f['type']) for f in abi if f['type'] in ['function','event']]"
```

Compare against ABI arrays in JS files. Fix any mismatch.

---

## PHASE 5 — FRONTEND AUDIT

### 5.1 — Read frontend structure

```bash
find frontend/src -type f | sort
cat frontend/src/App.jsx 2>/dev/null || cat frontend/src/App.tsx 2>/dev/null
cat frontend/src/services/api.js 2>/dev/null || \
  find frontend/src -name "api*" | xargs cat 2>/dev/null
```

### 5.2 — Required frontend pages/components

Verify these exist. If missing, create them:

**A) Dashboard — `/` route**
Shows agent status table:
- Live count by status (pending / submitted / confirmed / failed)
- Latest 10 records with hash, status, tx link (Etherscan Sepolia), IPFS link

API call: `GET /api/agent/status`

**B) Verify page — `/verify/:hash` route**
Input: SHA-256 hash
Output: on-chain proof data + DB metadata + AI analysis
API call: `GET /api/verify/:hash`

**C) Live feed component**
Poll `GET /api/agent/status` every 10 seconds using `setInterval` in `useEffect`.
Show status badge with color coding:
- `pending` → yellow
- `submitted` → blue  
- `confirmed` → green
- `failed` → red

### 5.3 — API base URL

```bash
grep -rn "localhost:3000\|VITE_API_URL\|API_BASE" frontend/src/ frontend/.env* 2>/dev/null
```

All API calls must use an environment variable, never hardcoded localhost:
```javascript
// In frontend/.env
VITE_API_BASE_URL=http://localhost:3000

// In code
const API_BASE = import.meta.env.VITE_API_BASE_URL;
```

Fix any hardcoded URLs.

---

## PHASE 6 — DOCKER VERIFICATION

### 6.1 — Read all Docker files

```bash
cat docker-compose.yml 2>/dev/null || cat docker/docker-compose.yml
find . -name "Dockerfile*" | grep -v node_modules | xargs ls -la
find . -name "Dockerfile*" | grep -v node_modules | while read f; do echo "=== $f ==="; cat "$f"; done
```

### 6.2 — Required services in docker-compose

Verify these services are defined (add if missing):

```yaml
services:
  firmware:
    # Isolated build environment for ESP-IDF
    # Does NOT run at runtime — only for builds
    build:
      context: .
      dockerfile: docker/Dockerfile.firmware
    volumes:
      - ./firmware:/project/firmware
      - firmware_cache:/root/.espressif
    environment:
      - IDF_PATH=/opt/esp/idf
    command: ["idf.py", "build"]

  backend:
    build:
      context: ./backend
      dockerfile: ../docker/Dockerfile.backend
    ports:
      - "3000:3000"
    env_file:
      - ./backend/.env
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: ../docker/Dockerfile.frontend
    ports:
      - "5173:80"
    depends_on:
      - backend
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: imagechain
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./backend/src/db/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d imagechain"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
  firmware_cache:
```

### 6.3 — Run full stack

```bash
# Build all
docker-compose build

# Start backend + DB + frontend
docker-compose up -d db backend frontend

# Check logs
docker-compose logs -f backend

# Firmware build only (isolated)
docker-compose run --rm firmware
```

### 6.4 — Verify connectivity

```bash
# Backend health
curl http://localhost:3000/api/agent/status

# DB connection inside backend container
docker-compose exec backend node -e \
  "const p = require('./src/db/pool'); p.query('SELECT NOW()').then(r=>console.log(r.rows)).catch(console.error)"
```

---

## PHASE 7 — END-TO-END TEST (Do last)

### 7.1 — Generate test payload (simulates ESP32)

```bash
node - << 'EOF'
const crypto = require("crypto");

// Must match AES_KEY_HEX in .env
const KEY = Buffer.from("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f", "hex");
const IV  = crypto.randomBytes(12);

// Fake "JPEG" payload
const plaintext = Buffer.from("FAKE_JPEG_DATA_" + Date.now());

const cipher = crypto.createCipheriv("aes-256-gcm", KEY, IV);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag();

const payload = {
  type:       "image",
  ciphertext: ciphertext.toString("base64"),
  iv:         IV.toString("base64"),
  tag:        tag.toString("base64"),
  timestamp:  Date.now(),
};

console.log(JSON.stringify(payload, null, 2));
EOF
```

### 7.2 — Submit test payload

```bash
# Copy JSON output from above, then:
curl -X POST http://localhost:3000/api/image/ingest \
  -H "Content-Type: application/json" \
  -d '<PASTE_JSON_HERE>'
```

Expected response:
```json
{
  "hash": "64-char-hex",
  "tx_hash": null,
  "ipfs_cid": "Qm...",
  "ai_analysis": { ... },
  "status": "partial"
}
```

`tx_hash` is null initially — the blockchain agent picks it up within 15 seconds.

### 7.3 — Verify agent picked it up

```bash
# Wait 20 seconds
sleep 20

# Check agent status
curl http://localhost:3000/api/agent/status

# Should show status moved from 'pending' to 'submitted' or 'confirmed'
```

### 7.4 — Verify on-chain

```bash
# Use hash from ingest response
curl http://localhost:3000/api/verify/<HASH_FROM_RESPONSE>

# Expected:
# { "exists_on_chain": true, "chain_proof": { ... } }
```

---

## AGENT COMPLETION CHECKLIST

Before marking this task complete, verify every item:

### Firmware
- [ ] Zero references to ATECC608A in any `.c`, `.h`, or `CMakeLists.txt`
- [ ] Zero references to DS3231 in any `.c`, `.h`
- [ ] AES key loaded from NVS (not hardcoded)
- [ ] IV generated with `esp_fill_random()` (hardware RNG)
- [ ] Timestamp via SNTP + `gettimeofday()`
- [ ] AES mode is GCM, not ECB
- [ ] Docker firmware build: `idf.py build` exits 0

### Backend
- [ ] AES-256-GCM decryption matches firmware parameters exactly
- [ ] SHA-256 computed over raw ciphertext buffer
- [ ] All async functions have try/catch
- [ ] `.env.example` has all variables
- [ ] Migration `002_agent_fields.sql` applied

### Blockchain Agent
- [ ] `blockchainAgent.js` created and wired into `app.js`
- [ ] Agent polls every 15s for pending, 30s for confirmation
- [ ] ABI in agent matches deployed contract
- [ ] `GET /api/agent/status` returns data
- [ ] Duplicate submission guard (proofExists check) works

### Contract
- [ ] Contract deployed on Sepolia
- [ ] `CONTRACT_ADDRESS` in `.env` is correct and not a placeholder
- [ ] ABI arrays in all JS files match deployed contract

### Frontend
- [ ] Dashboard shows agent status counts
- [ ] Verify page works with a real hash
- [ ] No hardcoded `localhost:3000` — uses `VITE_API_BASE_URL`
- [ ] Status badges show correct colors

### Docker
- [ ] `docker-compose build` succeeds for all services
- [ ] `docker-compose up` starts backend + DB + frontend
- [ ] Firmware container builds firmware in isolation

### End-to-End
- [ ] Test payload ingested successfully
- [ ] Blockchain agent submits tx within 20 seconds
- [ ] Verify endpoint returns `exists_on_chain: true`

---

## AGENT_LOG.md FORMAT (Maintain throughout)

```markdown
## [PHASE X] — [timestamp]

### Action
[what you did]

### Files Modified
- path/to/file.c — [reason]

### Before (if relevant)
```old code```

### After
```new code```

### Verification Result
[command run + output]

### Status
✅ Complete | ⚠️ Warning: [detail] | ❌ Blocked → see AGENT_BLOCKED.md
```

---

## IF YOU GET STUCK

Write to `AGENT_BLOCKED.md`:

```markdown
## BLOCKED — [timestamp]

### Phase
[X.Y]

### Expected
[what should happen]

### Actual
[what is happening]

### Files Involved
[list]

### Attempted Fixes
[list]

### Information Needed
[what you need to proceed]
```

Then stop. Do not guess. Do not make destructive changes while blocked.
