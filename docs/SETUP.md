# ENIGMA Setup Guide

Complete installation and configuration instructions for all components.

---

## Prerequisites

### System Requirements
- **OS:** Linux, macOS, or Windows (with WSL2)
- **RAM:** 4GB minimum (8GB recommended)
- **Disk:** 10GB free space

### Required Software

| Component | Requirement |
|-----------|-------------|
| Node.js | 18.x or later |
| Python | 3.8+ (for firmware simulator) |
| PostgreSQL | 12+ (database) |
| Docker | 20.10+ (optional, for containerized deployment) |
| ESP-IDF | 5.1.x (for firmware development) |

---

## Installation Steps

### **1. Clone Repository**

```bash
git clone https://github.com/Dwarak18/ENIGMA.git
cd ENIGMA
```

---

### **2. Backend Setup (Node.js)**

#### Install Dependencies
```bash
cd backend
npm install
```

#### Create Environment File
```bash
cp .env.example .env
```

#### Edit `.env` Configuration

**Critical Settings:**
```bash
# Server
PORT=3000
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL=postgres://user:password@localhost:5432/enigma_db

# CORS
CORS_ORIGINS=http://localhost:5173

# Security
MAX_TIMESTAMP_SKEW_S=60
DEVICE_WATCHDOG_MS=15000

# Blockchain (optional)
BLOCKCHAIN_RPC_URL=http://localhost:8545
BLOCKCHAIN_CONTRACT_ADDRESS=0x...

# Logging
LOG_LEVEL=info
```

#### Set Up Database

**Option A: Using Docker**
```bash
docker run -d \
  --name postgres-enigma \
  -e POSTGRES_USER=enigma \
  -e POSTGRES_PASSWORD=enigma_pass \
  -e POSTGRES_DB=enigma_db \
  -p 5432:5432 \
  postgres:15
```

**Option B: Local PostgreSQL**
```bash
# macOS (Homebrew)
brew install postgresql@15
brew services start postgresql@15

# Linux (Ubuntu/Debian)
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start

# Create database
createdb enigma_db
```

#### Run Database Migrations
```bash
cd backend
npm run migrate
```

#### Start Backend Server
```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

Check: `curl http://localhost:3000/health`

---

### **3. Frontend Setup (React)**

#### Install Dependencies
```bash
cd frontend
npm install
```

#### Create Environment File
```bash
cp .env.example .env.local
```

#### Edit `.env.local` Configuration

```bash
VITE_BACKEND_URL=http://localhost:3000
VITE_API_URL=http://localhost:3000/api/v1
VITE_WS_URL=ws://localhost:3000
```

#### Start Development Server
```bash
npm run dev
```

Check: `http://localhost:5173` (opens in browser)

---

### **4. Firmware Setup (ESP32-S3)**

#### Install ESP-IDF 5.1

**Windows:**
```bash
# Download installer
# https://docs.espressif.com/projects/esp-idf/en/v5.1/esp32/get-started/

# Or use Chocolatey
choco install esp-idf
```

**macOS:**
```bash
# Using Homebrew
brew install esp-idf
source ~/esp/esp-idf/export.sh
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install \
  git wget flex bison gperf \
  python3-pip python3-venv \
  cmake ninja-build ccache

git clone --depth 1 --branch v5.1.x https://github.com/espressif/esp-idf.git ~/esp/esp-idf
cd ~/esp/esp-idf
./install.sh
source export.sh
```

#### Load IDF Environment
```bash
cd firmware

# Load IDF environment (do this in each terminal)
source ~/esp/esp-idf/export.sh  # Linux/macOS
# OR on Windows:
C:\path\to\esp-idf\export.bat
```

#### Configure Firmware

**Edit `firmware/main/config.h`:**
```c
#define WIFI_SSID "your_network_ssid"
#define WIFI_PASSWORD "your_network_password"
#define SNTP_SYNC_TIMEOUT_MS 30000
#define IST_OFFSET_SECS (5 * 3600 + 30 * 60)  // IST = UTC+5:30
#define UART_PAYLOAD_MAX_BYTES 256
```

#### Build Firmware

```bash
cd firmware

# Set target to ESP32-S3
idf.py set-target esp32s3

# Build
idf.py build

# Size summary
idf.py size
```

#### Flash to ESP32-S3

**Identify USB Port:**
```bash
# Linux/macOS
ls /dev/tty.* | grep -E "usb|usbserial"

# Windows
# Check Device Manager → Ports (COM & LPT)
```

**Flash Firmware:**
```bash
idf.py -p /dev/ttyUSB0 flash

# Monitor logs
idf.py -p /dev/ttyUSB0 monitor

# Flash + Monitor (combined)
idf.py -p /dev/ttyUSB0 flash monitor
```

**Exit Monitor:** `Ctrl+]`

---

### **5. Firmware Simulator (Optional)**

For testing without physical ESP32-S3:

#### Install Python Dependencies
```bash
cd firmware
pip install -r requirements.txt
```

#### Run Simulator
```bash
BACKEND_URL=http://127.0.0.1:3000 python simulate.py
```

Simulator will:
- Generate ECDSA keypair (persisted to disk)
- Generate AES-256 key (persisted to disk)
- Connect to backend
- Emit entropy every 3-10 seconds
- Display crypto logs

---

## Docker Compose (Full Stack)

For complete containerized deployment:

#### Build and Start
```bash
docker compose up -d --build
```

#### Check Services
```bash
docker compose ps

# Output:
# NAME            STATE     PORTS
# enigma-backend  running   0.0.0.0:3000→3000/tcp
# enigma-frontend running   0.0.0.0:5173→5173/tcp
# postgres        running   0.0.0.0:5432→5432/tcp
```

#### View Logs
```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

#### Run Migrations
```bash
docker compose exec backend npm run migrate
```

#### Stop Services
```bash
docker compose down

# Also remove volumes
docker compose down -v
```

---

## Verification

### **1. Backend Health Check**
```bash
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2026-05-02T19:40:00Z"}
```

### **2. Frontend Access**
```bash
# Open browser
http://localhost:5173
```

### **3. Database Connection**
```bash
# Test PostgreSQL
psql -U enigma -d enigma_db -c "SELECT version();"
```

### **4. WebSocket Connection**
```javascript
// In browser console
const socket = io('http://localhost:3000');
socket.on('connect', () => console.log('Connected!'));
socket.on('entropy:new', (data) => console.log('New entropy:', data));
```

### **5. Submit Test Entropy**
```bash
curl -X POST http://localhost:3000/api/v1/entropy \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "TEST_DEVICE",
    "timestamp": "2026-05-02T19:40:00Z",
    "entropy_hash": "291a598a8a0a2bf645954c55b4bb1694...",
    "signature": "ca06f135f83ae0855f482e0ee5f0e5a5...",
    "public_key": "0429af20ab43c0b040bd..."
  }'
```

---

## Configuration Reference

### Backend (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| NODE_ENV | development | Environment (development/production) |
| DATABASE_URL | - | PostgreSQL connection string |
| CORS_ORIGINS | http://localhost:5173 | Allowed origins (comma-separated) |
| MAX_TIMESTAMP_SKEW_S | 60 | Timestamp freshness window (seconds) |
| DEVICE_WATCHDOG_MS | 15000 | Device timeout (milliseconds) |
| LOG_LEVEL | info | Log level (error/warn/info/debug) |
| BLOCKCHAIN_RPC_URL | http://localhost:8545 | Blockchain RPC endpoint |
| BLOCKCHAIN_CONTRACT_ADDRESS | - | Smart contract address (with 0x prefix) |

### Frontend (.env.local)

| Variable | Default | Description |
|----------|---------|-------------|
| VITE_BACKEND_URL | http://localhost:3000 | Backend base URL |
| VITE_API_URL | http://localhost:3000/api/v1 | REST API base URL |
| VITE_WS_URL | ws://localhost:3000 | WebSocket URL |

### Firmware (config.h)

| Constant | Default | Description |
|----------|---------|-------------|
| WIFI_SSID | "WIFI_SSID" | WiFi network name |
| WIFI_PASSWORD | "WIFI_PASSWORD" | WiFi password |
| SNTP_SYNC_TIMEOUT_MS | 30000 | SNTP sync timeout (ms) |
| IST_OFFSET_SECS | 19800 | IST timezone offset (5:30 hours) |
| UART_PAYLOAD_MAX_BYTES | 256 | Max UART payload size |

---

## Troubleshooting

### **Backend fails to connect to database**

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection string
echo $DATABASE_URL

# Test manual connection
psql $DATABASE_URL -c "SELECT 1"
```

### **Frontend can't reach backend**

```bash
# Check backend is running
curl http://localhost:3000/health

# Check CORS origins in backend/.env
grep CORS_ORIGINS .env

# Check frontend environment variables
cat .env.local
```

### **Firmware won't compile**

```bash
# Clean build
idf.py fullclean
idf.py build

# Check ESP-IDF version
idf.py --version

# Ensure correct target
idf.py set-target esp32s3
```

### **UART monitor shows garbage characters**

```bash
# Check baud rate (should be 115200)
idf.py -p /dev/ttyUSB0 monitor --baud 115200
```

### **Signature verification fails**

```bash
# Verify public key format (130 hex chars, "04" prefix)
# Verify signature format (128 hex chars)
# Check device is using P-256/secp256r1 curve
```

---

## Next Steps

1. **Review [docs/ARCHITECTURE.md](ARCHITECTURE.md)** for system design
2. **Read [docs/API.md](API.md)** for complete API documentation
3. **Check [docs/SECURITY.md](SECURITY.md)** for security best practices
4. **Explore the Dashboard** at http://localhost:5173

---

**Last Updated:** 2026-05-02
