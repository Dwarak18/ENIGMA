# ENIGMA – Security Checklist & Model

## Threat Model

| Threat                  | Mitigation                                               |
|-------------------------|----------------------------------------------------------|
| Forged entropy payload  | ECDSA signature verification before storage/broadcast   |
| Replay attack           | Unique DB constraint on (device_id, timestamp, hash)    |
| Stale timestamp injection | ±60s freshness window enforced server-side            |
| Private key theft       | Key stored in NVS encrypted partition, never transmitted|
| MitM / eavesdropping    | HTTPS/TLS enforced; HTTP redirected                      |
| DDoS / flooding         | Nginx rate limit + express-rate-limit                    |
| SQL injection           | Parameterised queries only (no string interpolation)     |
| XSS via stored data     | Frontend renders hash/sig as text, not innerHTML         |
| CORS misconfiguration   | Explicit origin whitelist via environment variable       |
| Dependency CVE          | Use `npm audit` regularly; renovate/dependabot           |

---

## Firmware Security

### Key Management

- Private key is generated **once** at first boot using `mbedtls_ecdsa_genkey()`
  seeded from the ESP32-S3 hardware TRNG (ISO/IEC 19790 certified).
- Key is stored in the NVS **encrypted partition** (`nvs_flash_init_partition()`
  with flash encryption enabled in production).
- The private key is **never logged, printed, or transmitted**.
- Only signatures and the public key are sent over the network.

### Flash Security (Production)

Enable the following in `sdkconfig` before flashing production devices:

```
CONFIG_FLASH_ENCRYPTION_ENABLED=y   # encrypts flash contents
CONFIG_SECURE_BOOT=y                # verifies firmware signature at boot
CONFIG_NVS_ENCRYPTION=y             # encrypts NVS partition
```

These settings are **commented out** in `sdkconfig.defaults` to ease development.
**Uncomment them before deploying to production hardware.**

### Network

- All communication over HTTPS with server certificate verification
  (`use_global_ca_store = true` – uses the bundled Mozilla CA store).
- SNTP synchronisation before any payload is sent, preventing timestamp spoofing.

---

## Backend Security

### Signature Verification

- Verification is performed using **Node.js built-in `crypto`** module –
  no third-party ECDSA library.
- Algorithm: ECDSA with SHA-256, curve secp256r1 (prime256v1).
- Signature conversion from raw r‖s (firmware format) to DER (Node.js
  requirement) is handled in `verifier.js`.
- **Verification happens before DB insertion and WebSocket broadcast.**
  Invalid payloads are rejected at the service layer with a clear error code.

### API Security

| Control                  | Implementation                              |
|--------------------------|---------------------------------------------|
| Rate limiting            | `express-rate-limit` (200 req / 15 min/IP)  |
| Input validation         | `express-validator` on all fields           |
| Security headers         | `helmet` middleware                         |
| CORS                     | Explicit origin whitelist                   |
| Body size limit          | 64 KB max                                   |
| Trust proxy              | Set for Nginx; `X-Forwarded-For` respected  |

### Database

- All queries use parameterised placeholders (SQL injection impossible).
- Unique index on `(device_id, timestamp, entropy_hash)` prevents replays.
- `pg` pool uses connection timeout and idle timeout.

---

## Infrastructure Security

### Nginx

- HTTP → HTTPS redirect (301).
- TLS 1.2+ only; weak ciphers disabled.
- HSTS header with `preload` directive.
- Prometheus `/metrics` endpoint restricted to internal subnets.
- Rate limit zone `api` with burst allowance.

### Secrets Management

- **Never commit `.env` files** (`.gitignore` enforced).
- Use Docker secrets or a secrets manager (Vault, AWS Secrets Manager) in
  production to inject `DATABASE_URL`, `POSTGRES_PASSWORD`.

---

## Security Checklist (Pre-Production)

- [ ] Flash encryption enabled on all devices
- [ ] Secure boot enabled on all devices
- [ ] NVS encryption enabled
- [ ] Real TLS certificate (Let's Encrypt) installed in Nginx
- [ ] `.env` files excluded from repository
- [ ] `POSTGRES_PASSWORD` changed from default `changeme`
- [ ] `CORS_ORIGINS` set to production frontend URL only
- [ ] Rate limit tuned for expected device count
- [ ] `npm audit` clean (no high/critical CVEs)
- [ ] Prometheus `/metrics` not reachable from public internet
- [ ] Docker images built with non-root user
- [ ] Logs do not contain private keys or raw entropy
