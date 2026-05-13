# ENIGMA Security Notes

## Security model summary

ENIGMA relies on cryptographic identity + replay defense at ingest time:

- Device payloads must include a valid ECDSA P-256 signature.
- Backend enforces timestamp freshness window (`MAX_TIMESTAMP_SKEW_S`, default `60`).
- Replay is blocked by unique `(device_id, timestamp, entropy_hash)`.
- Records are persisted before broadcast and can be anchored to local blockchain.

## Payload-level controls

| Threat | Control |
|---|---|
| Forged payload | Signature verification in backend service |
| Unknown device impersonation | Public key registration/lookup + verification |
| Replay | Unique DB index on device + timestamp + hash |
| Stale replay | Timestamp skew check |

## Operational controls

- Keep `backend/.env` out of version control.
- Restrict CORS origins to explicit UI domains.
- Keep local Hardhat private key values as development-only secrets.
- Rotate production credentials (database, RPC credentials, API secrets).
- Serve backend behind TLS termination in production.

## Firmware-side recommendations

- Use hardware-backed key storage when available.
- Enable secure boot and flash/NVS encryption for production firmware.
- Avoid logging sensitive key material.

## Open-source safety checklist

- [ ] No secrets in committed `.env` or source files.
- [ ] No production private keys in compose overrides.
- [ ] No real certificates/keys committed.
- [ ] Security-impacting changes are documented in PR notes.
