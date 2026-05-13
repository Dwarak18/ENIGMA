# ENIGMA

**Cryptographically-verifiable entropy pipeline for IoT devices.**

ENIGMA combines ESP32 firmware/signing, a Node.js verification backend, PostgreSQL persistence, local blockchain anchoring, and a React real-time dashboard.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Socket.IO client |
| Backend | Node.js, Express, Socket.IO, node-postgres |
| Database | PostgreSQL 15 |
| Blockchain | Solidity, Hardhat, ethers.js |
| Firmware | ESP-IDF (C), mbedTLS, Python simulator |
| Tooling | Docker Compose |

## Repository structure

```text
ENIGMA/
├── backend/          # Node/Express API + websocket server
├── frontend/         # React/Vite dashboard
├── firmware/         # ESP32 firmware + simulator
├── tools/            # Device listener and utilities
├── contracts/        # Solidity contracts
├── database/         # PostgreSQL schema
├── docs/             # Project documentation
├── metrics/          # Metrics tooling and reports
└── docker-compose.yml
```

## Quick start

### Docker (recommended)

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
docker compose exec backend node src/db/migrate.js
```

Open:
- Frontend: `http://localhost`
- Backend health: `http://localhost/health` or `http://localhost:3000/health`

### Local development

```bash
# 1) Contracts / local chain
npx hardhat node
# new terminal:
npx hardhat run scripts/deploy.js --network localhost

# 2) Backend
cd backend
npm install
npm run migrate
npm run dev

# 3) Frontend
cd ../frontend
npm install
npm run dev
```

For firmware simulator and device listener setup, see `docs/SETUP.md`.

## Documentation

- [Documentation index](docs/README.md)
- [Setup guide](docs/SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Security notes](docs/SECURITY.md)
- [Testing guide](docs/TESTING.md)
- [Hardware signing upgrade path (ATECC608A)](docs/HARDWARE_UPGRADE.md)

## Open source contribution

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening PRs.

## License

This project is licensed under the ISC License. See [LICENSE](LICENSE).
