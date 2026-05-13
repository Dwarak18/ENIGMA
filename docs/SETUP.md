# ENIGMA Setup

This guide is for the current runtime stack:
- Backend: Node/Express (`backend/src/server.js`)
- Frontend: React/Vite
- Database: PostgreSQL
- Blockchain: local Hardhat
- Optional: firmware simulator + device listener

## Prerequisites

- Node.js 18+
- npm 9+
- Python 3.8+
- Docker + Docker Compose (recommended path)

## Option A: Docker (recommended)

From repo root:

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
docker compose exec backend node src/db/migrate.js
```

Endpoints:
- Frontend: `http://localhost`
- Backend API: `http://localhost:3000/api/v1`
- Health: `http://localhost:3000/health`
- Hardhat RPC: `http://localhost:8545`

## Option B: Local services

### 1) Start local chain and deploy contract

```bash
npx hardhat node
```

In a second terminal:

```bash
npx hardhat run scripts/deploy.js --network localhost
```

### 2) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm run dev
```

### 3) Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Make sure both frontend env names are aligned when overriding defaults:
- `VITE_BACKEND_URL`
- `VITE_API_URL`

## Optional components

### Firmware simulator

```bash
cd firmware
pip install -r requirements.txt
python simulate.py
```

### USB/serial device listener

```bash
cd tools/device_listener
pip install -r requirements.txt
python listener.py
```

## First checks

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/system/status
curl http://localhost:3000/api/v1/entropy/latest
```
