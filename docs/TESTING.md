# ENIGMA Testing Guide

Current repository validation focuses on build + runtime checks.

## Current test reality

- Backend has `backend/tests/entropy.test.js`, but no wired npm `test` runner in backend package scripts.
- Frontend has no component/unit test runner configured.
- Smart contracts are testable with Hardhat.

## Backend checks

```bash
cd backend
npm install
npm run migrate
npm run dev
```

Then validate endpoints:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/system/status
curl http://localhost:3000/api/v1/entropy/history?limit=5
```

## Frontend checks

```bash
cd frontend
npm install
npm run build
```

`npm run lint` exists but currently requires adding an ESLint config file to the frontend workspace.

## Contract checks

From repo root:

```bash
npx hardhat compile
npx hardhat test
```

## Firmware simulator checks

```bash
cd firmware
pip install -r requirements.txt
python simulate.py
```

## Device listener checks

```bash
cd tools/device_listener
pip install -r requirements.txt
python listener.py
```
