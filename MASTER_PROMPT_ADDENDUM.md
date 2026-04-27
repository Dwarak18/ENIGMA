
---
## ⬇️ PROJECT CONTEXT ADDENDUM — PASTE THIS AT BOTTOM OF MASTER PROMPT
---

### 🔧 PROJECT: Secure Webcam → Encrypt → Hash → Blockchain + AI Proof System

**Hardware Stack (FINAL):**
- Capture device: Laptop built-in camera OR external USB webcam (NO ESP32 camera)
- Capture method: Browser via WebRTC (`getUserMedia`) OR Python via OpenCV (`cv2`)
- No embedded firmware required for this variant

**Software Stack (LOCKED):**
- Frontend: React (Vite) + TailwindCSS — live webcam feed, capture trigger, proof dashboard
- Backend: Node.js / Express
- Database: PostgreSQL (with uuid-ossp, JSONB)
- Blockchain: Ethereum Sepolia Testnet via Ethers.js + Infura
- Smart Contract: Solidity (Hardhat) — `ImageProof.sol`
- IPFS: Pinata API
- AI: Anthropic Claude Vision (`claude-opus-4-5`) — image analysis
- Crypto: AES-256-GCM (Node.js `crypto` module, browser `SubtleCrypto`)

**Architecture (NON-NEGOTIABLE):**
```
[Browser/Webcam]
  getUserMedia → JPEG frame
        ↓
  AES-256-GCM encrypt (SubtleCrypto or backend-side)
        ↓
  HTTP POST → /api/image/ingest
        ↓
[Backend: Node.js/Express]
  Validate → Decrypt → SHA-256 hash
        ↓ (parallel)
  IPFS upload (ciphertext)  +  Claude Vision (plaintext JPEG)
        ↓
  storeProof(hash, CID) → Sepolia
        ↓
  PostgreSQL record
        ↓
[React Dashboard]
  Real-time proof feed, verify by hash, AI analysis viewer
```

**Key Decisions (do NOT suggest alternatives unless asked):**
- AES key: 32-byte, managed server-side, sent to client via secure session (no hardcoding)
- IV: Random per capture, sent alongside ciphertext
- Hash target: SHA-256 of the raw ciphertext buffer (not plaintext)
- Blockchain stores: hash + IPFS CID only (no raw image data on-chain)
- AI analyzes: decrypted JPEG (not ciphertext)
- Duplicate detection: DB unique constraint on `image_hash`

**Active Phases:**
1. ✅ Architecture finalized
2. 🔄 Webcam capture → encrypt → POST (in progress)
3. 🔄 Backend ingest pipeline (in progress)
4. ⏳ Blockchain write + verify
5. ⏳ React dashboard with live feed + proof viewer

**Constraints (ALWAYS respect these):**
- No ESP-IDF, no embedded C, no camera hardware code
- No ECB mode, no hardcoded secrets, no plain HTTP in production
- All inputs validated (Joi on backend, Zod on frontend)
- PostgreSQL only — no MongoDB
- React state only — no localStorage/sessionStorage in artifacts
- AES-256-GCM exclusively — reject any suggestion of CBC/ECB

**Current File Structure:**
```
/secure-image-chain/
├── contracts/          # Hardhat + ImageProof.sol
├── backend/            # Node.js/Express
│   └── src/
│       ├── routes/
│       ├── controllers/
│       ├── services/   # hash, ipfs, blockchain, ai
│       ├── db/
│       └── middleware/
└── frontend/           # React (Vite) + TailwindCSS
    └── src/
        ├── components/ # WebcamCapture, ProofDashboard, VerifyModal
        ├── hooks/      # useWebcam, useCapturePipeline
        └── services/   # api.js, crypto.js
```

**When I ask for code in this project:**
- Always produce complete, working files — no fragments
- Assume production deployment (error handling, logging, security)
- Flag any security vulnerability introduced, even minor
- Never repeat architecture decisions already made above

---
