# ENIGMA: Entropy Capture & Cryptographic Verification System

Complete full-stack implementation of a tamper-evident entropy capture and AES-128 encryption pipeline.

## 🎯 System Overview

**ENIGMA** is a cryptographically secure logging system that:

1. **Captures** images from webcams or USB cameras
2. **Extracts** entropy-like bitstreams from images via LSB analysis
3. **Conditions** entropy using SHA-256 hashing
4. **Encrypts** processed data using AES-128-CTR
5. **Generates** integrity hashes with timestamp-based key derivation
6. **Stores** records in PostgreSQL with cryptographic chaining
7. **Verifies** integrity on-demand to detect tampering

## 📦 Technology Stack

### Backend
- **FastAPI** (Python web framework)
- **OpenCV** (image processing & bitstream extraction)
- **cryptography/pycryptodome** (AES-128-CTR, SHA-256)
- **SQLAlchemy** (ORM)
- **PostgreSQL 15** (persistent storage)

### Frontend
- **React 18** (with Vite)
- **Tailwind CSS** (styling)

### DevOps
- **Docker Compose** (full stack orchestration)
- **Nginx** (reverse proxy & SPA serving)

## 🏗️ Project Structure

```
ENIGMA/
├── backend/                     # Python FastAPI
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py           # Configuration & settings
│   │   ├── database.py         # SQLAlchemy setup
│   │   ├── models.py           # ORM models
│   │   ├── schemas.py          # Pydantic validators
│   │   ├── main.py             # FastAPI routes
│   │   └── services/
│   │       ├── crypto.py       # AES, key derivation, hashing
│   │       └── image_processing.py  # Bitstream extraction
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env                    # Configuration (create from .env.example)
├── frontend/                   # React
│   ├── src/
│   │   ├── App.jsx
│   │   ├── hooks/
│   │   │   ├── useEnigmaAPI.js  # API integration
│   │   │   └── useCamera.js     # Webcam access
│   │   └── pages/
│   │       ├── CamerasPage.jsx     # Image capture
│   │       └── VerificationPage.jsx # Integrity verification
│   ├── Dockerfile
│   └── vite.config.js
├── database/
│   └── schema.sql              # PostgreSQL schema
├── docker-compose.yml
└── docs/
    ├── API.md                  # API reference
    └── QUICK_START.md         # Setup guide
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- OR: Python 3.11+, Node.js 18+, PostgreSQL 15+

### Option 1: Docker Compose (Recommended)

```bash
# Navigate to project root
cd ENIGMA

# Build and start all services
docker compose up -d --build

# Check logs
docker compose logs -f backend
docker compose logs -f frontend

# Access the application
# Frontend: http://localhost
# API: http://localhost/api (proxied through Nginx)
```

**Shutdown:**
```bash
docker compose down          # Stop and remove containers
docker compose down -v       # Also remove postgres volume
```

### Option 2: Local Development

#### Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Edit .env with your database credentials

# Initialize database (make sure PostgreSQL is running)
sqlalchemy upgrade

# Start FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:5173` and will proxy API calls to `http://localhost:8000`.

## 🔐 Cryptographic Pipeline

### Image Capture → Entropy Extraction
```
Camera Frame (JPEG)
    ↓
Base64 Encode & Send to Backend
    ↓
OpenCV: Convert to Grayscale
    ↓
Extract Bitstream (LSB method):
    bit[i] = pixel[i] & 1
    ↓
Raw Bitstream (bytes)
```

### Entropy Conditioning
```
Raw Bitstream
    ↓
SHA256(bitstream_bytes)
    ↓
Conditioned Entropy (32 bytes)
```

### Key Derivation
```
device_id + timestamp + server_seed
    ↓
SHA256(concatenation)
    ↓
First 16 bytes
    ↓
AES-128 Key
```

### Encryption
```
Conditioned Entropy (32 bytes)
    ↓
AES-128-CTR(key, iv)
    ↓
Encrypted Data + IV (hex-encoded)
```

### Integrity Hash
```
encrypted_data + timestamp + derived_key [+ previous_hash]
    ↓
SHA256(concatenation)
    ↓
Integrity Hash (64-char hex)
```

### Hash Chaining (Tamper Prevention)
```
Record N:  integrity_hash(data + key + Record N-1)
Record N+1: integrity_hash(data + key + Record N)
```

If any past record is modified, all subsequent integrity hashes become invalid.

## 📡 API Endpoints

### Device Management

#### Register Device
```http
POST /devices
Content-Type: application/json

{
  "device_id": "device-001",
  "public_key": "04..." (130 hex chars, secp256r1 uncompressed)
}

Response: 200 OK
{
  "device_id": "device-001",
  "public_key": "04...",
  "first_seen": "2024-01-15T10:30:00Z",
  "last_seen": "2024-01-15T10:30:00Z"
}
```

### Entropy Capture

#### Capture & Encrypt Image
```http
POST /capture
Content-Type: application/json

{
  "image": "base64_encoded_jpeg_image",
  "device_id": "device-001"
}

Response: 200 OK
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "device_id": "device-001",
  "timestamp": 1705318200,
  "entropy_hash": "a3b4c5d6...",
  "integrity_hash": "x9y8z7w6...",
  "image_hash": "sha256_of_bitstream",
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Record Access

#### Get All Records
```http
GET /records?device_id=device-001&limit=100

Response: 200 OK
[
  { /* entropy record */ },
  ...
]
```

#### Get Specific Record
```http
GET /records/{record_id}

Response: 200 OK
{
  /* entropy record */
}
```

### Verification

#### Verify Record Integrity
```http
POST /verify/{record_id}

Response: 200 OK
{
  "record_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_valid": true,
  "timestamp": 1705318200,
  "entropy_hash": "a3b4c5d6...",
  "integrity_hash": "stored_hash",
  "computed_hash": "newly_computed_hash",
  "message": "Integrity verified"
}
```

### System

#### Health Check
```http
GET /health

Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "service": "ENIGMA Entropy Backend"
}
```

#### Get Statistics
```http
GET /statistics

Response: 200 OK
{
  "total_devices": 3,
  "total_entropy_records": 157,
  "devices_by_count": [
    { "device_id": "device-001", "record_count": 95 },
    ...
  ]
}
```

## 🎮 Frontend Usage

### Camera Capture Page
1. Navigate to **Cameras** tab
2. Enter a device ID (e.g., "device-001")
3. Set capture interval (seconds)
4. Click **Capture & Encrypt Frame** or enable auto-capture
5. View entropy/integrity hashes and record ID

### Verification Page
1. Navigate to **Verification** tab
2. Paste a Record ID (from capture result)
3. Click **Verify Record**
4. Review computed vs. stored integrity hash
5. **✓ Match** = No tampering detected
6. **✗ Mismatch** = Record integrity compromised

## ⚙️ Configuration

### Backend (.env)

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://enigma:changeme@postgres:5432/enigma_db` |
| `SERVER_RANDOM_SEED` | Server seed for key derivation | `default-seed-change-me` |
| `DEBUG` | Enable debug mode | `False` |
| `AES_KEY_SIZE` | AES key size in bytes | `16` (128-bit) |
| `CORS_ORIGINS` | Allowed frontend origins | `["http://localhost"]` |

### Frontend (vite.config.js)

```javascript
// Define API backend URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
```

## 🛡️ Security Considerations

### Non-Negotiable Rules
1. ✅ **Never store AES keys** - Always derive from device_id + timestamp
2. ✅ **Never use AES-ECB** - Use CTR mode for semantic security
3. ✅ **Always include timestamp in hashes** - Prevents replay attacks
4. ✅ **Always condition entropy** - SHA-256 hashing before encryption
5. ✅ **Validate inputs** - Check Base64 size, image dimensions
6. ✅ **Implement hash chaining** - Makes records tamper-evident

### What This System IS
- ✅ Tamper-evident secure logging pipeline
- ✅ Cryptographically verifiable record system
- ✅ Image-based entropy extraction & conditioning

### What This System IS NOT
- ❌ True cryptographic random number generator (TRNG)
- ❌ Suitable for cryptographic key generation alone
- ❌ Protection against physical tampering or hardware compromise

## 📊 Database Schema

### devices table
```sql
CREATE TABLE devices (
    device_id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW()
);
```

### entropy_records table
```sql
CREATE TABLE entropy_records (
    id UUID PRIMARY KEY,
    device_id TEXT REFERENCES devices(device_id),
    timestamp BIGINT NOT NULL,
    entropy_hash TEXT NOT NULL,
    integrity_hash TEXT NOT NULL,
    aes_ciphertext TEXT,
    aes_iv TEXT,
    image_bits TEXT,
    image_hash TEXT,
    previous_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🧪 Testing

### Manual API Testing with curl

```bash
# Register a device
curl -X POST http://localhost:8000/devices \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device-001",
    "public_key": "04' + '0'*128 + '"
  }'

# Health check
curl http://localhost:8000/health

# Get statistics
curl http://localhost:8000/statistics
```

### Frontend Testing
1. Open http://localhost (or http://localhost:5173 for dev)
2. Grant camera permission when prompted
3. Fill in device ID
4. Click "Capture & Encrypt Frame"
5. Copy Record ID to Verification page
6. Click "Verify Record" and confirm match

## 📚 Additional Documentation

- [API.md](./docs/API.md) - Detailed API reference
- [QUICK_REFERENCE.md](./docs/QUICK_REFERENCE.md) - Quick lookup guide
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - System design details
- [SECURITY.md](./docs/SECURITY.md) - Security analysis

## 🐛 Troubleshooting

### Docker Issues

**Backend container exits immediately:**
```bash
docker compose logs backend
# Check: DATABASE_URL in .env
# Check: PostgreSQL is healthy (docker compose ps)
```

**Frontend can't connect to backend:**
```bash
# Check Nginx reverse proxy logs
docker compose logs frontend

# Browser console (F12) should show API calls to /api/*
```

### Local Development Issues

**ImportError: No module named 'cv2':**
```bash
pip install opencv-python
```

**Database connection refused:**
```bash
# Ensure PostgreSQL is running
psql -U enigma -d enigma_db

# Or start PostgreSQL service
docker run -d \
  -e POSTGRES_DB=enigma_db \
  -e POSTGRES_USER=enigma \
  -e POSTGRES_PASSWORD=changeme \
  -p 5432:5432 \
  postgres:15-alpine
```

**Camera permission denied:**
- Browser needs camera permission (check browser settings)
- On Linux: check udev rules for /dev/video* access
- On Windows: ensure Windows permissions are granted

## 📝 License & Attribution

This project implements the ENIGMA system as specified in the technical requirements.

## 🚀 Next Steps

1. **Deploy to production:** Update SERVER_RANDOM_SEED and CORS_ORIGINS
2. **Add ECDSA signatures:** Implement device-side signing with public keys
3. **Implement key rotation:** Periodic server seed updates
4. **Add audit logging:** Log all verification attempts
5. **Integrate with blockchain:** Archive integrity hashes to immutable ledger

---

**Documentation Version:** 1.0  
**Last Updated:** 2024-01-15  
**Status:** Production-ready
