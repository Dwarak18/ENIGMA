# ENIGMA Documentation

This folder contains the maintained documentation for the current Node/Express + React runtime.

## Read in this order

1. [SETUP.md](SETUP.md) - run the project locally or via Docker.
2. [ARCHITECTURE.md](ARCHITECTURE.md) - understand data flow and module responsibilities.
3. [API.md](API.md) - REST and websocket contracts.
4. [SECURITY.md](SECURITY.md) - security assumptions and deployment hardening checklist.
5. [TESTING.md](TESTING.md) - current validation workflow.
6. [HARDWARE_UPGRADE.md](HARDWARE_UPGRADE.md) - optional ATECC608A signing migration.

## Scope

These docs cover:
- Active backend runtime: `backend/src/server.js` (Node/Express).
- Frontend runtime: `frontend/src/App.jsx` (React + Vite).
- Database schema: `database/schema.sql`.
- Local blockchain flow with Hardhat.

If a document or external note conflicts with the above, trust this docs set and the source code.
