# ENIGMA – Security & Threat Model

**ENIGMA** provides defense-in-depth cryptographic verification through device authentication, timestamp validation, replay protection, hash chaining, and blockchain anchoring.

---

## Threat Model & Mitigations

### Quick Reference

| Threat | Mitigation | Risk |
|--------|-----------|------|
| **Forged entropy payload** | ECDSA signature verification before storage/broadcast | Very Low |
| **Replay attack** | Unique DB constraint on (device_id, timestamp, entropy_hash) | Very Low |
| **Stale timestamp injection** | ±60s freshness window enforced server-side | Low |
| **Device impersonation** | P-256 ECDSA public key resolution & verification | Very Low |
| **Private key theft** | Key stored in NVS encrypted partition, never transmitted | Medium |
| **MitM / eavesdropping** | HTTPS/TLS 1.2+ enforced; certificate pinning available | Low |
| **DDoS / flooding** | Nginx rate limit + express-rate-limit + connection pool limits | Medium |
| **SQL injection** | Parameterised queries only (no string interpolation) | Very Low |
| **Database compromise** | Restrictive role permissions; audit logging available | Medium |
| **Signature verification bypass** | All POST /entropy require valid ECDSA signature | Very Low |
| **Firmware supply chain** | Secure boot + firmware signing (optional) | Low |
| **Quantum cryptography** | P-256 ECDSA will be vulnerable to quantum computers | High (future) |

---

## Detailed Threat Analysis

### **1. Forged Entropy Payload**
**Attack:** Attacker submits entropy as a legitimate device without valid signature.  
**Mitigation:** ECDSA signature verification required on every POST. Public key resolution from trusted database. Signature validation throws error, prevents DB insert.  
**Residual Risk:** Very Low

### **2. Replay Attack**
**Attack:** Attacker captures and re-submits same entropy submission.  
**Mitigation:** UNIQUE constraint on (device_id, timestamp, entropy_hash). Database prevents duplicate inserts.  
**Residual Risk:** Very Low

### **3. Timestamp Spoofing**
**Attack:** Attacker replays old entropy with current timestamp, forging freshness.  
**Mitigation:** Backend validates timestamp freshness: `abs(now - payload.timestamp) ≤ 60 seconds`. Prevents stale submissions.  
**Residual Risk:** Low

### **4. Device Impersonation**
**Attack:** Attacker claims to be a different legitimate device.  
**Mitigation:** Signature is unique to device's private key. Without the private key, attacker cannot forge valid signatures. P-256 ECDSA provides 128-bit equivalent strength.  
**Residual Risk:** Very Low

### **5. Private Key Compromise**
**Attack:** Attacker gains access to ESP32 firmware and extracts the ECDSA private key.  
**Mitigation:**
- Flash encryption (hardware-based, encrypts entire flash partition)
- Secure boot verification (verifies firmware signature at boot)
- NVS encryption (encrypts NVS partition containing private key)
- Regular key rotation (quarterly recommended)

**Residual Risk:** Medium (physical attacks on hardware possible)

### **6. Man-in-the-Middle (MITM)**
**Attack:** Attacker intercepts HTTPS communication, steals signatures or injects forged payloads.  
**Mitigation:**
- HTTPS/TLS 1.2+ enforced (HTTP redirected to HTTPS)
- Server certificate verification on ESP32 (uses Mozilla CA bundle)
- Optional: Certificate pinning on ESP32 (if available in mbedTLS)
- HSTS header with long expiry

**Residual Risk:** Low (TLS 1.2+ with strong ciphers resists attacks)

### **7. DDoS / Flooding**
**Attack:** Attacker floods /entropy endpoint with thousands of requests.  
**Mitigation:**
- Express-rate-limit: 200 requests per 15 minutes per IP
- Nginx rate limiting: 100 requests per second per IP
- Connection pool limits: max 20 concurrent database connections
- Database unique constraint prevents duplicate insertions (fast failure)

**Residual Risk:** Medium (could exhaust resources with distributed attack)

### **8. SQL Injection**
**Attack:** Attacker injects malicious SQL into device_id or other fields.  
**Mitigation:**
- All queries use parameterised placeholders (`$1`, `$2`)
- Input validation via express-validator
- No string concatenation in SQL queries
- Type coercion on numeric fields

**Residual Risk:** Very Low

### **9. Database Compromise**
**Attack:** Attacker gains unauthorized access to PostgreSQL database.  
**Mitigation:**
- Backend connects with restricted role (not admin)
- Database user has SELECT/INSERT/UPDATE only on entropy_records table
- Audit triggers log all modifications
- Password-based auth with strong passwords (min 16 chars)
- Network access restricted via firewall and pg_hba.conf

**Residual Risk:** Medium (depends on deployment security)

### **10. Signature Verification Bypass**
**Attack:** Backend fails to verify signature and accepts invalid submission.  
**Mitigation:**
- Signature verification is mandatory on all POST /entropy requests
- Verification throws error immediately if signature invalid
- Error codes distinguish: MISSING_SIGNATURE vs INVALID_SIGNATURE vs UNKNOWN_DEVICE
- No silent failures

**Residual Risk:** Very Low

### **11. Firmware Supply Chain Attack**
**Attack:** Attacker modifies firmware binary before flashing to device.  
**Mitigation:**
- Secure boot (optional sdkconfig): verifies firmware signature at boot
- Flash encryption: encrypts firmware and data
- Firmware signing with developer private key
- Use trusted distribution channels

**Residual Risk:** Low (if Secure Boot enabled)

### **12. Cryptographic Weakness**
**Attack:** Attacker exploits weakness in ECDSA, AES, or SHA-256.  
**Mitigation:**
- ECDSA: P-256 (secp256r1) – NIST-approved, 128-bit strength
- AES: AES-128-ECB with PKCS#7 padding (hardware-accelerated on ESP32)
- SHA-256: NIST SHA-2 family – no known practical attacks
- All via mbedTLS library (peer-reviewed, maintained)

**Residual Risk:** Very Low (algorithms well-established)

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

## Production Security Checklist

### **Firmware (ESP32-S3)**

- [ ] **Enable Flash Encryption**
  ```bash
  idf.py menuconfig
  # → Security Features → Enable Flash Encryption
  # → Select "Encryption Key: Generate Digest First Time"
  ```

- [ ] **Enable Secure Boot**
  ```bash
  idf.py menuconfig
  # → Security Features → Enable Secure Boot (V2)
  # → Select "Secure Boot Mode: One-time Flash"
  ```

- [ ] **Enable NVS Encryption**
  ```c
  // In config.h or via menuconfig
  #define NVS_ENCRYPTION_ENABLED 1
  ```

- [ ] **Disable Debug Logs in Release**
  ```bash
  idf.py menuconfig
  # → Component config → Log output → Default log verbosity: Warning
  ```

- [ ] **Validate HTTPS Certificate Chain**
  - Add CA certificate bundle to firmware
  - Validate backend certificate during TLS handshake

- [ ] **Rotate ECDSA Keys Quarterly**
  - Backup old keys to secure storage
  - Generate new keypair in NVS
  - Notify backend of key rotation

---

### **Backend (Node.js)**

- [ ] **Enforce HTTPS/TLS**
  ```bash
  NODE_ENV=production
  HTTPS_KEY=/etc/tls/private.key
  HTTPS_CERT=/etc/tls/certificate.crt
  ```

- [ ] **Set Strict CORS Origins**
  ```bash
  # Production only - never use "*"
  CORS_ORIGINS=https://domain.com,https://api.domain.com
  ```

- [ ] **Enable Security Headers (Helmet.js)**
  ```javascript
  const helmet = require('helmet');
  app.use(helmet());
  // Enforces HSTS, CSP, X-Frame-Options, etc.
  ```

- [ ] **Rate Limiting on /entropy**
  ```javascript
  const rateLimit = require('express-rate-limit');
  app.use('/api/v1/entropy', rateLimit({
    windowMs: 60000,
    max: 100,  // 100 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false
  }));
  ```

- [ ] **Validate All Inputs**
  - express-validator on every endpoint
  - Type checking and bounds checking
  - Sanitize user-controlled strings

- [ ] **Enable Request Logging**
  ```bash
  LOG_LEVEL=info
  # Log: device_id, signature status, timestamp freshness, replay attempts
  ```

- [ ] **Monitor Device Watchdog Timeouts**
  - Alert if device goes offline unexpectedly
  - Log watchdog state transitions
  - Track TRNG state changes

- [ ] **Database Security**
  ```sql
  -- Create restricted user (NOT admin)
  CREATE ROLE enigma_app LOGIN PASSWORD 'strong_secure_password';
  GRANT CONNECT ON DATABASE enigma_db TO enigma_app;
  GRANT USAGE ON SCHEMA public TO enigma_app;
  GRANT SELECT, INSERT, UPDATE ON entropy_records TO enigma_app;
  GRANT SELECT ON devices TO enigma_app;
  GRANT SELECT ON pending_blockchain TO enigma_app;
  
  -- Revoke dangerous permissions
  REVOKE ALL ON DATABASE enigma_db FROM PUBLIC;
  ```

- [ ] **Connection Pool Configuration**
  ```javascript
  const pool = new Pool({
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    statementTimeout: 30000
  });
  ```

- [ ] **Secrets Management**
  - Never commit `.env` files
  - Use environment variables for all secrets
  - Rotate `DATABASE_URL` password regularly (every 90 days)
  - Use AWS Secrets Manager or HashiCorp Vault in production

---

### **Frontend (React)**

- [ ] **Content Security Policy (CSP)**
  ```html
  <meta http-equiv="Content-Security-Policy" 
        content="default-src 'self'; 
                 script-src 'self' 'wasm-unsafe-eval'; 
                 style-src 'self' 'unsafe-inline'; 
                 connect-src 'self' wss: https:">
  ```

- [ ] **HTTPS Only**
  ```javascript
  if (window.location.protocol !== 'https:' && !isLocalhost()) {
    window.location.href = 'https:' + window.location.href.substring(window.location.protocol.length);
  }
  ```

- [ ] **Validate Backend URL**
  ```javascript
  const backendUrl = new URL(import.meta.env.VITE_BACKEND_URL);
  if (backendUrl.protocol !== 'https:' && !isLocalhost()) {
    throw new Error('Backend must use HTTPS in production');
  }
  ```

- [ ] **Secure WebSocket (WSS)**
  ```bash
  # Production: Use wss:// not ws://
  VITE_WS_URL=wss://api.domain.com
  ```

- [ ] **XSS Prevention**
  - React escapes by default
  - Use `dangerouslySetInnerHTML` sparingly
  - Sanitize with `DOMPurify` for user-controlled content
  - Avoid `eval()` and dynamic code execution

- [ ] **CSRF Protection**
  - Include CSRF token in state-changing requests
  - Validate token on server
  - Use SameSite cookie policy

---

### **Database (PostgreSQL)**

- [ ] **Strong Passwords**
  - Minimum 16 characters
  - Mixed case, numbers, symbols
  - Rotate every 90 days

- [ ] **Enable SSL Connections**
  ```bash
  # In postgresql.conf
  ssl = on
  ssl_cert_file = '/etc/postgresql/cert.pem'
  ssl_key_file = '/etc/postgresql/key.pem'
  ssl_protocols = 'TLSv1.2,TLSv1.3'
  ```

- [ ] **Restrict Network Access**
  ```bash
  # In pg_hba.conf - only allow backend server
  # Local connections
  local   enigma_db    enigma_app    trust
  # Backend server IP
  host    enigma_db    enigma_app    10.0.1.0/24    md5
  # Deny everything else
  host    enigma_db    all           all            reject
  ```

- [ ] **Enable Audit Logging**
  ```sql
  -- Log all modifications
  CREATE TRIGGER audit_entropy_inserts
  AFTER INSERT ON entropy_records
  FOR EACH ROW EXECUTE FUNCTION audit_log('INSERT');
  
  CREATE TRIGGER audit_entropy_updates
  AFTER UPDATE ON entropy_records
  FOR EACH ROW EXECUTE FUNCTION audit_log('UPDATE');
  ```

- [ ] **Backup & Recovery**
  ```bash
  # Daily backups
  pg_dump -U enigma_app enigma_db | gzip > /backup/enigma_$(date +\%Y\%m\%d).sql.gz
  
  # Test recovery regularly (monthly)
  gunzip < /backup/enigma_20260501.sql.gz | psql -U enigma_app enigma_db_test
  ```

- [ ] **Monitor Disk Usage**
  - Alert if disk > 80% full
  - Implement log rotation (pglogkeeper)
  - Archive old records to cold storage

---

### **Infrastructure & Deployment**

- [ ] **Use HTTPS with Valid Certificate**
  - Let's Encrypt (free, auto-renewing)
  - Certificate pinning on ESP32 (optional)
  - TLS 1.2+ only (disable 1.0, 1.1, 3.0)

- [ ] **Enable Nginx Security Headers**
  ```nginx
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
  ```

- [ ] **Firewall Rules**
  - Inbound: Allow 80 (HTTP), 443 (HTTPS), 22 (SSH) only
  - Outbound: ESP32 can reach backend only (restrict to specific IP)
  - Egress: Backend can reach PostgreSQL, Blockchain RPC only

- [ ] **Regular Security Updates**
  - Patch OS monthly (apply in maintenance window)
  - Patch Node.js, Python, PostgreSQL immediately for critical CVEs
  - Subscribe to security advisories (nvd.nist.gov)
  - Test updates in staging before production

- [ ] **Logging & Monitoring**
  - Alert on repeated signature verification failures
  - Alert on device watchdog timeouts
  - Alert on database connection errors
  - Alert on failed blockchain anchor submissions
  - Central log aggregation (ELK, Splunk, or CloudWatch)

- [ ] **Incident Response Plan**
  - Document procedures for private key compromise
  - Document procedures for data breach
  - Maintain incident log
  - Conduct quarterly drills
  - Contact list for security team

---

## Cryptographic Constants

| Component | Value | Standard |
|-----------|-------|----------|
| **ECDSA Curve** | P-256 (secp256r1) | NIST |
| **Hash Algorithm** | SHA-256 | NIST SP 800-38D |
| **Block Cipher** | AES-128 | NIST FIPS 197 |
| **Block Cipher Mode** | ECB (firmware), CBC/CTR (backend) | NIST SP 800-38A |
| **Padding** | PKCS#7 | NIST SP 800-38A |
| **Timestamp Window** | ±60 seconds | Custom |
| **Public Key Format** | Uncompressed P-256 (65 bytes, "04" prefix) | SEC 2 |
| **Signature Format** | Raw r\|\|s (64 bytes) | Firmware convention |
| **RNG** | ESP32 hardware RNG (mbedTLS) | ISO/IEC 19790 |

---

## Security Assumptions & Limitations

### **Assumptions**
1. **Backend is trusted:** No cryptographic assumptions for backend compromise
2. **PostgreSQL is hardened:** Database access restricted, audit logging enabled
3. **Network is monitored:** Intrusion detection systems in place
4. **Keys are rotated:** ECDSA keys rotated at least quarterly
5. **Firmware is validated:** Code review + testing before production flash
6. **Supply chain is secure:** Firmware downloaded from trusted sources
7. **TLS certificates valid:** Let's Encrypt or trusted CA

### **Limitations**
1. **No quantum resistance:** P-256 ECDSA vulnerable to quantum computers (future)
2. **No offline verification:** Verification requires active backend
3. **No threshold cryptography:** Single-signature required, no multi-sig
4. **Single device chain:** No cross-device integrity verification
5. **No forward secrecy:** Signature does not provide forward secrecy
6. **Time dependency:** Relies on accurate NTP synchronization

---

## Incident Response Procedures

### **Signature Verification Failure**

1. **Immediate Actions:**
   - Log event with full context (device_id, timestamp, signature)
   - Alert security team (Slack/PagerDuty)
   - Continue processing (non-blocking)

2. **Investigation (within 1 hour):**
   - Check device logs for issues
   - Verify public key in database is correct
   - Test with known-good signature from same device
   - Check timestamp synchronization on ESP32

3. **Resolution:**
   - If device issue: Force key rotation or restart device
   - If backend issue: Roll back recent changes
   - If network issue: Check TLS certificate validity

### **Private Key Compromise**

1. **Immediate Actions:**
   - Block device from further submissions (firewall or database)
   - Revoke public key (DELETE from devices table)
   - Notify admin team

2. **Investigation (within 24 hours):**
   - Audit all entropy submissions from device (check for forged records)
   - Determine attack vector (physical, network, firmware)
   - Check if other devices were compromised

3. **Recovery:**
   - Force key rotation on all devices
   - Reboot affected device with new key
   - Post-mortem: Document root cause and improvements
   - Update security procedures

### **Database Breach**

1. **Immediate Actions:**
   - Isolate database (stop all connections)
   - Take filesystem snapshot for forensics
   - Notify executive team and legal

2. **Recovery (within 4 hours):**
   - Restore from clean, uncompromised backup
   - Rotate all credentials (passwords, API keys)
   - Update backend environment variables

3. **Post-Incident:**
   - Notify affected devices/users
   - Forensic analysis of breach
   - Security audit of all systems
   - Update security checklist

---

## Compliance & Standards

### **Standards Used**
- **NIST FIPS 186-4:** ECDSA digital signature standard
- **NIST SP 800-38A:** Block cipher modes of operation
- **NIST SP 800-38D:** GMAC and GCM authenticated encryption
- **RFC 5280:** X.509 public key infrastructure (TLS certificates)
- **RFC 7539:** ChaCha20/Poly1305 AEAD (if used)

### **Certifications & Compliance**
- **Data Protection:** No personal data stored (device_id only), GDPR-compliant
- **Financial:** Not payment-related, PCI DSS not applicable
- **Healthcare:** Not healthcare-related, HIPAA not applicable
- **Hardware:** ESP32-S3 is RoHS-compliant

---

## Security References

- **ESP-IDF Security:** https://docs.espressif.com/projects/esp-idf/en/latest/esp32/security/
- **MbedTLS Documentation:** https://mbed-tls.readthedocs.io/
- **NIST Standards:** https://nvlpubs.nist.gov/nistpubs/FIPS/
- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **Node.js Security:** https://nodejs.org/en/docs/guides/security/
- **PostgreSQL Security:** https://www.postgresql.org/docs/current/sql-syntax.html
