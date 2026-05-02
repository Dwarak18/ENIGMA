# ENIGMA Documentation Index

Welcome to the ENIGMA cryptographic logging system. This directory contains comprehensive documentation for all aspects of the project.

---

## 📚 Quick Navigation

### **Getting Started** (New Users)
1. **[START HERE: 00_START_HERE.md](00_START_HERE.md)** ⭐
   - High-level project overview
   - Key concepts and architecture
   - Quick-start checklist

2. **[SETUP.md](SETUP.md)**
   - Installation instructions for all components
   - Environment configuration
   - Database setup (PostgreSQL)
   - Firmware flashing (ESP32-S3)
   - Docker Compose deployment

3. **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)**
   - Common commands (build, test, run)
   - Troubleshooting quick fixes
   - Port and endpoint reference

---

## 🏗️ Architecture & Design

### **System Architecture**
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design, data flow, state machines
- **[IOT_ARCHITECTURE.md](IOT_ARCHITECTURE.md)** - Full IoT stack architecture
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Technical implementation details

### **Component-Specific**
- **[ESP32_FIRMWARE.md](ESP32_FIRMWARE.md)** - Firmware architecture, crypto pipeline, SNTP synchronization
- **[IMAGE_BITSTREAM.md](IMAGE_BITSTREAM.md)** - Entropy extraction from camera feeds
- **[REALTIME_STREAMING_IMPLEMENTATION.md](REALTIME_STREAMING_IMPLEMENTATION.md)** - WebSocket and real-time updates

---

## 🔌 API Documentation

- **[API.md](API.md)** - REST and WebSocket API reference
- **[API_REFERENCE.md](API_REFERENCE.md)** - Detailed endpoint documentation with examples

---

## 🔐 Security & Compliance

- **[SECURITY.md](SECURITY.md)** ⭐ **READ BEFORE PRODUCTION**
  - Threat model analysis (12 major threats)
  - Mitigation strategies
  - Production security checklist
  - Incident response procedures
  - Cryptographic constants and standards

---

## ✅ Testing & Validation

- **[TESTING.md](TESTING.md)**
  - Unit testing (backend/frontend)
  - Integration testing (full stack)
  - End-to-end testing (with ESP32)
  - Load testing and stress testing
  - CI/CD pipeline setup

---

## 🚀 Deployment

- **[PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md)** - Complete production setup
- **[SETUP_DEPLOYMENT.md](SETUP_DEPLOYMENT.md)** - Deployment checklist and procedures

---

## 📋 Hardware & Upgrades

- **[HARDWARE_UPGRADE.md](HARDWARE_UPGRADE.md)** - Hardware migration and upgrade guide

---

## 📂 Project Structure

```
ENIGMA/
├── frontend/                    # React + Vite UI
│   ├── src/
│   │   ├── pages/              # Page components (Cameras, Devices, etc.)
│   │   ├── hooks/              # useEnigmaAPI, useWebSocket
│   │   └── App.jsx             # Main app router
│   └── package.json
│
├── backend/                     # Node.js + Express API
│   ├── src/
│   │   ├── routes/             # REST endpoints (/entropy, /devices, etc.)
│   │   ├── services/           # Business logic (entropyService, crypto, blockchain)
│   │   ├── middleware/         # Authentication, validation, CORS
│   │   └── server.js           # Express app initialization
│   ├── tests/                  # Unit tests
│   └── package.json
│
├── firmware/                    # ESP32-S3 C/C++ code
│   ├── main/
│   │   ├── main.c              # Entry point, UART loop
│   │   ├── crypto.c            # AES, SHA-256, ECDSA (mbedTLS)
│   │   ├── ntp.c               # SNTP synchronization
│   │   └── uart.c              # Serial communication
│   ├── CMakeLists.txt
│   └── simulate.py             # Python simulator (offline testing)
│
├── database/                    # PostgreSQL schema
│   ├── schema.sql              # Table definitions
│   └── migrations/             # Schema updates
│
├── contracts/                   # Smart contracts (Ethereum)
│   └── EnigmaAnchor.sol        # Blockchain anchoring contract
│
├── docs/                        # This directory
│   ├── README.md               # Documentation index (you are here)
│   ├── 00_START_HERE.md        # Quick overview
│   ├── SETUP.md                # Installation guide
│   ├── ARCHITECTURE.md         # System design
│   ├── API.md                  # API reference
│   ├── SECURITY.md             # Security & threat model
│   ├── TESTING.md              # Testing guide
│   └── ...
│
├── README.md                    # Project overview
├── docker-compose.yml           # Full stack Docker setup
├── package.json                 # Monorepo root
└── .env.example                 # Environment variables template
```

---

## 🔑 Key Concepts

### **Cryptographic Pipeline**
1. **Entropy Capture:** Laptop camera → LSB extraction → raw bitstream
2. **Hardware Conditioning:** ESP32-S3 → SHA-256(bitstream) → 32 bytes
3. **Key Derivation:** SHA-256(device_id + timestamp + server_seed) → AES-128 key
4. **Encryption:** AES-128-ECB(key, conditioned_data) → ciphertext
5. **Integrity Hashing:** SHA-256(ciphertext + timestamp + key + prev_hash) → immutable chain
6. **Blockchain Anchoring:** Submit hash to smart contract → tamper-evident log

### **Device Authentication**
- **Public Key Format:** Uncompressed P-256 (130-char hex: "04" + X + Y)
- **Signature Format:** Raw r||s (128-char hex)
- **Verification:** ECDSA-SHA256 on backend before DB insertion
- **Result:** Cryptographic proof device created this entropy

### **Replay Protection**
- **Constraint:** UNIQUE (device_id, timestamp, entropy_hash)
- **Mechanism:** Database-enforced uniqueness prevents duplicate submissions
- **Impact:** If attacker replays same entropy, database returns 409 Conflict

### **Timestamp Validation**
- **Window:** ±60 seconds from server time (MAX_TIMESTAMP_SKEW_S)
- **Purpose:** Prevent stale submissions (entropy not recent)
- **Enforcement:** Server-side validation before DB insertion

### **Device State Management**
- **Watchdog Timeout:** 15 seconds (DEVICE_WATCHDOG_MS)
- **State Machine:** INACTIVE → ACTIVE → SUSPENDED
- **Tracking:** In-memory, not database-persisted (real-time accuracy)

---

## 📦 Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, Tailwind CSS, Socket.IO |
| **Backend** | Node.js, Express, PostgreSQL, mbedTLS |
| **Firmware** | C/C++, ESP-IDF v5.1, mbedTLS, SNTP |
| **Blockchain** | Solidity, Hardhat, Ethereum (local) |
| **Database** | PostgreSQL 15, node-postgres |
| **DevOps** | Docker, Docker Compose, Nginx |

---

## ⚙️ Common Commands

### **Frontend**
```bash
cd frontend
npm install        # Install dependencies
npm run dev        # Start dev server (port 5173)
npm run build      # Build for production
npm run lint       # Check code quality
npm test           # Run tests
```

### **Backend**
```bash
cd backend
npm install        # Install dependencies
npm start          # Start server (port 3000)
npm run dev        # Start with hot reload
npm test           # Run tests
npm run migrate    # Run database migrations
```

### **Firmware**
```bash
cd firmware
idf.py build       # Build for esp32s3
idf.py -p COM3 flash    # Flash to device
idf.py -p COM3 monitor  # Monitor serial output
python simulate.py # Run offline simulator
```

### **Full Stack (Docker)**
```bash
docker compose up -d --build    # Start all services
docker compose ps               # Check status
docker compose logs -f backend  # View logs
docker compose down             # Stop all services
```

---

## 🧪 Testing Quick Start

```bash
# Backend unit tests
cd backend && npm test

# Frontend component tests
cd frontend && npm test

# Firmware simulator (offline crypto testing)
cd firmware && python simulate.py

# Full integration test
# 1. Start backend: cd backend && npm start
# 2. Start frontend: cd frontend && npm run dev
# 3. Run simulator: cd firmware && python simulate.py
# 4. Open http://localhost:5173 in browser
```

---

## 🚀 Deployment Paths

### **Local Development**
1. Follow [SETUP.md](SETUP.md)
2. Run all components locally
3. Use simulator or connected ESP32-S3

### **Docker (Recommended)**
1. `docker compose up -d --build`
2. Verify: `docker compose ps`
3. Access: http://localhost (frontend)

### **Production**
1. Read [SECURITY.md](SECURITY.md) — **CRITICAL**
2. Follow [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md)
3. Complete security checklist
4. Deploy with TLS, rate limiting, monitoring

---

## 🔐 Security Reminders

> **⚠️ BEFORE ANY PRODUCTION DEPLOYMENT:**
> 1. Read [SECURITY.md](SECURITY.md) completely
> 2. Enable firmware flash encryption + secure boot
> 3. Use real TLS certificates (Let's Encrypt)
> 4. Set `CORS_ORIGINS` to production domain only
> 5. Rotate all secrets (database password, API keys)
> 6. Enable database audit logging
> 7. Implement monitoring and alerting
> 8. Conduct security review with team

---

## 📞 Support & Troubleshooting

### **Common Issues**

**Q: Backend returns 500 on entropy POST**  
A: Check database connectivity. Verify DATABASE_URL, run migrations, check logs.

**Q: ESP32-S3 not detected on COM port**  
A: Install CH340 driver (Windows), verify device in Device Manager, try different USB cable.

**Q: Frontend can't reach backend**  
A: Check CORS_ORIGINS in backend/.env, verify backend is running on :3000, check firewall.

**Q: Crypto validation fails**  
A: Verify device public key is registered, check signature format (128-char hex), verify timestamp is fresh.

### **Full Troubleshooting**
See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for common fixes.

---

## 📖 Reading Order

**For New Developers:**
1. [00_START_HERE.md](00_START_HERE.md) — Overview
2. [SETUP.md](SETUP.md) — Get running locally
3. [ARCHITECTURE.md](ARCHITECTURE.md) — Understand design
4. [API.md](API.md) — Learn endpoints
5. [TESTING.md](TESTING.md) — Write tests

**For Security Review:**
1. [SECURITY.md](SECURITY.md) — Threat model
2. [ESP32_FIRMWARE.md](ESP32_FIRMWARE.md) — Crypto implementation
3. [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) — Deployment hardening

**For DevOps:**
1. [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) — Deployment
2. [QUICK_REFERENCE.md](QUICK_REFERENCE.md) — Common commands
3. Docker Compose setup in root directory

---

## 📝 Contributing

When updating documentation:
- Keep sections short and focused
- Use code examples liberally
- Link to related docs
- Update this index if adding new files
- Keep README.md in root synchronized with here

---

## 📜 License

ENIGMA — Cryptographically Secure Logging System  
See LICENSE file in repository root for details.

---

**Last Updated:** 2026-05-02  
**Version:** 1.0  
**Status:** Production Ready
