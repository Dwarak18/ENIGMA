# ENIGMA Local Setup & Testing Guide

## Overview

This guide walks you through setting up and running the complete ENIGMA system locally, including:
1. Backend API (Node.js/Express + PostgreSQL)
2. Frontend (React)
3. Firmware Simulator
4. Device Listener
5. Metrics Collection System

---

## Prerequisites

- **Docker & Docker Compose** (for backend + database)
- **Node.js 18+** (for frontend and backend, if not using Docker)
- **Python 3.8+** (for firmware simulator and metrics)
- **Git** (to clone the repo)

---

## Step 1: Start the Backend & Database

### Option A: Using Docker Compose (Recommended)

```bash
cd /path/to/ENIGMA
docker compose up -d --build
```

This starts:
- **PostgreSQL** on port 5432 (DB initialization runs automatically)
- **Backend API** on port 3000 (Node.js/Express)
- **Hardhat** on port 8545 (local blockchain for testing)

Verify services are running:
```bash
docker compose ps
```

Check backend health:
```bash
curl http://localhost:3000/health
```

Expected response: `{"ok":true,"uptime":...}`

### Option B: Manual Node.js Setup

```bash
cd backend
npm install
npm run dev
```

Requires PostgreSQL running separately.

---

## Step 2: Start the Frontend

### Option A: Using Vite dev server

```bash
cd frontend
npm install
npm run dev
```

Access frontend at: **http://localhost:5173**

### Option B: Production build

```bash
npm run build
npm run preview
```

---

## Step 3: Start the Firmware Simulator

The firmware simulator emulates ESP32 behavior via UART JSON protocol.

### Prerequisites

```bash
cd firmware
pip install -r requirements.txt
```

### Run the simulator

```bash
python simulate.py
```

Expected output:
```
[2026-05-03 21:33:40] Firmware simulator started
[2026-05-03 21:33:40] Listening on UART (simulated via TCP localhost:9000)
[2026-05-03 21:33:40] Waiting for requests...
```

---

## Step 4: Start the Device Listener

The device listener bridges firmware (UART) to backend (HTTP).

### Prerequisites

```bash
cd tools/device_listener
pip install -r requirements.txt
```

### Run the listener

```bash
python listener.py
```

Expected output:
```
[2026-05-03 21:33:41] Device listener starting...
[2026-05-03 21:33:41] Waiting for UART connections on COM*/dev/ttyUSB0
[2026-05-03 21:33:41] Backend API: http://localhost:3000
[2026-05-03 21:33:41] Ready to bridge entropy submissions
```

---

## Step 5: Verify End-to-End Connection

### Check all services are running

```bash
# Backend
curl -s http://localhost:3000/health | jq .

# Frontend (should return HTML)
curl -s http://localhost:5173 | head -10

# Database
psql -h localhost -U postgres -d enigma_db -c "SELECT COUNT(*) FROM entropy_records;"
```

### Send a test entropy submission

Terminal 1: Monitor backend logs
```bash
docker compose logs -f backend
```

Terminal 2: Trigger entropy via firmware simulator
```bash
# Inside firmware simulator, you can send a test payload
# Or use the device listener to trigger it

curl -X POST http://localhost:3000/api/v1/entropy \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "esp32-001",
    "timestamp": 1746449019,
    "entropy_hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
    "signature": "signature_r_hex||signature_s_hex",
    "public_key": "04||x_hex||y_hex"
  }'
```

### Observe in frontend

1. Open **http://localhost:5173** in browser
2. Go to **"Live Entropy"** page
3. You should see the submitted record appear in real-time (via Socket.IO)
4. Device status should show as "online"

---

## Step 6: Generate Performance Metrics

### Generate sample data

```bash
cd metrics/python
python sample_generator.py --runs 300 --output ../data/sample_metrics.json
```

Output: `../data/sample_metrics.json` with 300 realistic pipeline runs

### Generate graphs

```bash
python graphs.py --input ../data/sample_metrics.json --output ../graphs/
```

Outputs 7 PNG graphs to `../graphs/`:
- `latency_breakdown.png` — Firmware vs Network vs Backend latency
- `throughput.png` — Requests/sec over time
- `crypto_overhead.png` — Pie chart of latency contribution
- `network_reliability.png` — Success vs failure by percentile
- `power_consumption.png` — Simulated current draw
- `storage_growth.png` — Database growth projection
- `latency_distribution.png` — Histogram of E2E latencies

### Generate analysis report

```bash
python analyzer.py --input ../data/sample_metrics.json --report ../docs/analysis_report.md
```

Output: `../docs/analysis_report.md` with:
- Summary metrics (p50, p95, p99 latencies)
- Identified bottlenecks
- Failure analysis
- Recommendations

---

## Step 7: Collect Real Performance Data

### Option A: Continuous collection during local testing

Terminal 1: Run your system (firmware sim + device listener + backend)
```bash
# In separate terminals, start:
# - docker compose up
# - python firmware/simulate.py
# - python tools/device_listener/listener.py
```

Terminal 2: Run metrics collector
```bash
cd metrics/python
python collector.py --duration 300 --output ../data/real_metrics.json
```

This collects 5 minutes of real performance data.

### Option B: Manual log parsing

If you want to parse existing logs:

```bash
# Firmware logs
# Extract from firmware simulator UART output
# Format: {"event":"timing_checkpoint", ...}

# Backend logs
# Enable detailed logging in backend/src/services/entropyService.js
# then parse JSON log lines

python collector.py --parse-firmware-logs firmware_output.txt --parse-backend-logs backend_logs.jsonl --output ../data/real_metrics.json
```

---

## Data Flow Walkthrough

### Single entropy submission end-to-end

```
1. Firmware simulator generates random entropy
   └─ AES-128 encrypts it (15-40ms)
   └─ SHA-256 hashes encrypted data + timestamp (5-15ms)
   └─ Sends JSON via UART

2. Device listener receives UART JSON
   └─ Performs challenge-response handshake
   └─ Extracts device_id, public_key, signature
   └─ POSTs to http://localhost:3000/api/v1/entropy (30-80ms network)

3. Backend API (/api/v1/entropy)
   └─ Validates request format
   └─ Resolves device public key (cache hit or DB lookup)
   └─ Verifies ECDSA signature (8-15ms)
   └─ Checks timestamp freshness (±60 seconds)
   └─ Checks for replay attack (unique index lookup)
   └─ Inserts into entropy_records table (10-30ms DB)
   └─ Emits entropy:new event via Socket.IO

4. Frontend receives entropy:new event
   └─ Updates records[] state
   └─ Re-renders EntropyPage with new record
   └─ Computes entropy score (visual feedback)
   └─ Updates device online status

Total: ~50-230ms typical case
```

### Checking data in database

```bash
# List all entropy records
psql -h localhost -U postgres -d enigma_db -c "SELECT id, device_id, timestamp, entropy_hash FROM entropy_records LIMIT 10;"

# Count records by device
psql -h localhost -U postgres -d enigma_db -c "SELECT device_id, COUNT(*) FROM entropy_records GROUP BY device_id;"

# View latest record
psql -h localhost -U postgres -d enigma_db -c "SELECT * FROM entropy_records ORDER BY created_at DESC LIMIT 1 \gx"

# Check database size
psql -h localhost -U postgres -d enigma_db -c "SELECT pg_size_pretty(pg_total_relation_size('entropy_records'));"
```

---

## Troubleshooting

### Backend won't start

```bash
# Check if port 3000 is in use
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill existing process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows

# Restart
docker compose restart backend
```

### Database connection fails

```bash
# Verify PostgreSQL is running
docker compose logs db

# Check credentials in backend/.env
# Default: POSTGRES_USER=postgres, POSTGRES_PASSWORD=postgres

# Manually test connection
psql -h localhost -U postgres -W

# If schema not initialized, run manually
docker compose exec db psql -U postgres -d enigma_db -f /docker-entrypoint-initdb.d/schema.sql
```

### Firmware simulator not responding

```bash
# Check if simulator is running
ps aux | grep simulate.py

# Check if port is in use
lsof -i :9000  # Simulator UART TCP port

# Restart
python firmware/simulate.py
```

### Device listener not connecting to backend

```bash
# Verify backend is accessible
curl http://localhost:3000/health

# Check device listener logs
# Output should show: "Backend API: http://localhost:3000"

# Test direct POST to backend
curl -X POST http://localhost:3000/api/v1/entropy \
  -H "Content-Type: application/json" \
  -d '{"device_id":"test","timestamp":123,"entropy_hash":"abc...","signature":"def...","public_key":"ghi..."}'
```

### Frontend not connecting to backend

1. Check VITE_BACKEND_URL in frontend/.env
   ```bash
   cat frontend/.env
   # Should be: VITE_BACKEND_URL=http://localhost:3000
   ```

2. Check browser console (F12 → Console tab)
   - Look for connection errors
   - Check WebSocket connection status

3. Restart frontend dev server
   ```bash
   cd frontend
   npm run dev
   ```

### Graphs not generating

```bash
# Verify dependencies installed
pip list | grep -E "matplotlib|numpy"

# Reinstall if needed
pip install matplotlib numpy --force-reinstall

# Check sample data exists
ls -lh metrics/data/sample_metrics.json

# Run graphs with verbose output
python metrics/python/graphs.py --input metrics/data/sample_metrics.json --output metrics/graphs/ -v
```

---

## Common Commands Cheatsheet

```bash
# Start/stop entire stack
docker compose up -d
docker compose down

# Check service status
docker compose ps
docker compose logs -f backend
docker compose logs -f db

# Backend operations
cd backend && npm install && npm run dev
curl http://localhost:3000/api/v1/entropy/latest | jq

# Frontend operations
cd frontend && npm install && npm run dev
open http://localhost:5173

# Database operations
psql -h localhost -U postgres -d enigma_db
SELECT * FROM entropy_records ORDER BY created_at DESC LIMIT 5;
SELECT COUNT(*) FROM entropy_records;

# Firmware simulator
cd firmware && python simulate.py

# Device listener
cd tools/device_listener && python listener.py

# Metrics generation
cd metrics/python
python sample_generator.py --runs 200 --output ../data/test.json
python graphs.py --input ../data/test.json --output ../graphs/
python analyzer.py --input ../data/test.json --report ../docs/report.md
```

---

## Next Steps

1. **Understand the data flow**: Read `docs/END_TO_END_FLOW.md`
2. **Review performance metrics**: Check `metrics/docs/README.md` and `performance-guide.md`
3. **Analyze sample graphs**: Open generated PNG files in `metrics/graphs/`
4. **Inspect the code**: Start with `backend/src/routes/entropy.js` and `frontend/src/App.jsx`
5. **Run your own tests**: Use metrics system to measure performance on your hardware

---

## Support

For issues or questions:
1. Check `docs/` folder for detailed documentation
2. Review error logs in `docker compose logs`
3. Inspect code comments in source files
4. Create an issue on GitHub with error details

