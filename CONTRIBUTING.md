# Contributing to ENIGMA

Thanks for contributing.

## Development setup

1. Fork and clone the repository.
2. Follow [docs/SETUP.md](docs/SETUP.md).
3. Create a feature branch from `main`.

## Pull request expectations

- Keep changes focused and scoped.
- Update docs when behavior or APIs change.
- Keep secrets out of commits (`.env`, private keys, certs).
- Include clear reproduction/validation steps in the PR description.

## Validation before PR

Run relevant checks for touched areas:

```bash
# Frontend
cd frontend && npm run build

# Contracts
npx hardhat compile
npx hardhat test
```

If you run frontend linting, add an ESLint config in `frontend/` first.

For backend changes, confirm migration and startup still work:

```bash
cd backend
npm run migrate
npm run dev
```
