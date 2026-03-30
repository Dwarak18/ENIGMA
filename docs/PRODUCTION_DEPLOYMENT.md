# Production Deployment & Operations Guide

**Objective:** Ready your ENIGMA system for production with security, monitoring, and operational procedures.

---

## 🚀 Deployment Checklist

### Pre-Deployment (Security & Configuration)

- [ ] **Generate Production Seeds**
  ```bash
  # Hardware seed for ESP32 (keep SECRET)
  openssl rand -hex 32 > hardware_seed.bin
  
  # Server-side random seed (backend)
  openssl rand -hex 32 > server_seed.bin
  ```

- [ ] **Secure Secrets Management**
  ```bash
  # Never commit these files to git:
  # - firmware/main/secrets.h (DEVICE_ID, SSID, PASSWORD, BACKEND_URL)
  # - backend/.env (DATABASE_URL, SERVER_RANDOM_SEED)
  # - deployment/tls-certs.key (private keys)
  
  # Add to .gitignore
  echo "secrets.h" >> .gitignore
  echo ".env" >> .gitignore
  echo "*.key" >> .gitignore
  ```

- [ ] **TLS/HTTPS Certificates**
  ```bash
  # Self-signed cert (for testing)
  openssl req -x509 -newkey rsa:2048 -keyout server.key \
    -out server.crt -days 365 -nodes \
    -subj "/CN=enigma.local"

  # Production: Use LetsEncrypt or AWS ACM
  # certbot certonly --standalone -d enigma.example.com
  ```

- [ ] **Database Backup Strategy**
  ```bash
  # Create backup directory
  mkdir -p /backups/enigma
  
  # Add to crontab (daily at 2 AM)
  # 0 2 * * * /opt/enigma/backup.sh
  ```

- [ ] **Monitoring Setup**
  - [ ] Set up Prometheus for metrics collection
  - [ ] Configure Grafana dashboards
  - [ ] Setup alerting rules
  - [ ] Enable PostgreSQL query logging

---

## 🏗️ Deployment Architecture

### Single Machine (Proof of Concept)

```
┌─────────────────────────────────────────┐
│         Single Linux Server             │
├─────────────────────────────────────────┤
│  Docker Compose:                        │
│  ├─ PostgreSQL 15                       │
│  ├─ FastAPI backend (uvicorn)           │
│  ├─ React frontend (nginx)              │
│  └─ device-listener (Python)            │
│                                         │
│  Reverse Proxy:                         │
│  ├─ nginx on port 80/443                │
│  └─ SSL with cert                       │
└─────────────────────────────────────────┘
```

### Distributed (Production)

```
┌──────────────────────────────────────────────────────────┐
│                    Internet                              │
│                       ↓                                  │
│         ┌─────────────────────────────┐                 │
│         │   AWS ELB / CloudFlare      │                 │
│         │   (SSL Termination)         │                 │
│         └──────────┬──────────────────┘                 │
│                    ↓                                     │
│    ┌──────────────────────────────────┐                │
│    │   Kubernetes Cluster / ECS       │                │
│    ├──────────────────────────────────┤                │
│    │  - 3× FastAPI pods (load balanced)              │
│    │  - 1× Redis pod (caching)                       │
│    └──────────────┬───────────────────┘                │
│                   ↓                                     │
│    ┌──────────────────────────────────┐                │
│    │  AWS RDS / Aurora PostgreSQL     │                │
│    │  - Primary + read replicas       │                │
│    │  - Automated backups             │                │
│    │  - Replication lag < 100ms       │                │
│    └──────────────────────────────────┘                │
│                                                         │
│    ESP32 Devices                                        │
│    ↓ HTTPS POST /ingest                               │
│    ↓ (with TLS client certificate auth)               │
└──────────────────────────────────────────────────────────┘
```

---

## 📦 Docker Compose (Production Config)

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: enigma-db
    environment:
      POSTGRES_USER: enigma
      POSTGRES_PASSWORD: ${DB_PASSWORD}  # From .env
      POSTGRES_DB: enigma_prod
      POSTGRES_INITDB_ARGS: "-c shared_buffers=256MB -c work_mem=16MB"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
      - ./database/backups:/backups:ro
    ports:
      - "5432:5432"
    networks:
      - enigma_net
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U enigma -d enigma_prod"]
      interval: 10s
      timeout: 5s
      retries: 5

  # FastAPI Backend
  backend:
    build: ./backend
    container_name: enigma-backend
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://enigma:${DB_PASSWORD}@postgres:5432/enigma_prod
      SERVER_RANDOM_SEED: ${SERVER_RANDOM_SEED}
      DEBUG: "false"
      CORS_ORIGINS: '["https://enigma.example.com", "https://www.enigma.example.com"]'
    volumes:
      - ./logs:/app/logs
      - ./uploads:/app/uploads
    ports:
      - "8000:8000"
    networks:
      - enigma_net
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # React Frontend
  frontend:
    build: ./frontend
    container_name: enigma-frontend
    depends_on:
      - backend
    volumes:
      - ./frontend/dist:/usr/share/nginx/html:ro
      - ./nginx-spa.conf:/etc/nginx/conf.d/default.conf:ro
      - ./certs:/etc/nginx/certs:ro
    ports:
      - "80:80"
      - "443:443"
    networks:
      - enigma_net
    restart: always

  # Redis Cache (Optional)
  redis:
    image: redis:7-alpine
    container_name: enigma-redis
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    networks:
      - enigma_net
    restart: always
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}

volumes:
  postgres_data:
  redis_data:

networks:
  enigma_net:
    driver: bridge
```

---

## 📊 Monitoring & Alerting

### Prometheus Metrics

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # Backend metrics
  - job_name: 'fastapi'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: '/metrics'

  # PostgreSQL exporter
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']

  # Node exporter (host metrics)
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
```

### Grafana Dashboard JSON

```json
{
  "dashboard": {
    "title": "ENIGMA System Monitoring",
    "panels": [
      {
        "title": "Records Ingested (per minute)",
        "targets": [
          {"expr": "rate(enigma_records_created_total[1m])"}
        ]
      },
      {
        "title": "Verification Failures",
        "targets": [
          {"expr": "rate(enigma_verification_failures_total[5m])"}
        ]
      },
      {
        "title": "Backend Latency (p95)",
        "targets": [
          {"expr": "histogram_quantile(0.95, rate(enigma_request_duration_seconds_bucket[5m]))"}
        ]
      },
      {
        "title": "Database Disk Space",
        "targets": [
          {"expr": "pg_stat_total_heap_blks_read{job='postgres'}"}
        ]
      },
      {
        "title": "Active Devices",
        "targets": [
          {"expr": "count(enigma_device_last_seen_timestamp)"}
        ]
      }
    ]
  }
}
```

### Alert Rules

Create `alert_rules.yml`:

```yaml
groups:
  - name: enigma_alerts
    rules:
      # Critical: Verification failures exceeding threshold
      - alert: HighVerificationFailureRate
        expr: rate(enigma_verification_failures_total[5m]) > 0.01
        for: 5m
        annotations:
          summary: "High verification failure rate (>1%)"
          description: "{{ $value }} failures/sec detected"

      # Warning: Slow database queries
      - alert: SlowDatabaseQueries
        expr: pg_slow_queries > 10
        for: 10m
        annotations:
          summary: "Database experiencing > 10 slow queries"

      # Critical: Backend service down
      - alert: BackendDown
        expr: up{job="fastapi"} == 0
        for: 2m
        annotations:
          summary: "Backend service unreachable"

      # Warning: Database disk space low
      - alert: DiskSpaceLow
        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes < 0.1
        for: 10m
        annotations:
          summary: "Less than 10% disk space remaining"

      # Critical: PostgreSQL replication lag
      - alert: HighReplicationLag
        expr: pg_replication_lag_seconds > 5
        for: 5m
        annotations:
          summary: "Replication lag > 5 seconds"
```

---

## 🔐 Security Hardening

### 1. Firewall Rules (UFW Linux)

```bash
# Default deny all
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (admin only)
ufw allow from 203.0.113.0/24 to any port 22

# Allow HTTP/HTTPS (public)
ufw allow 80/tcp
ufw allow 443/tcp

# Allow PostgreSQL (internal only)
ufw allow from 10.0.0.0/8 to any port 5432

# Enable firewall
ufw enable
```

### 2. PostgreSQL Security

```sql
-- Create restricted user for backend
CREATE USER enigma_app WITH PASSWORD '${STRONG_PASSWORD}';
GRANT CONNECT ON DATABASE enigma_prod TO enigma_app;
GRANT USAGE ON SCHEMA public TO enigma_app;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO enigma_app;

-- Disable unnecessary permissions
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Enable SSL
-- Edit postgresql.conf:
-- ssl = on
-- ssl_cert_file = '/etc/ssl/certs/server.crt'
-- ssl_key_file = '/etc/ssl/private/server.key'

-- Require SSL for all connections
-- In pg_hba.conf:
-- hostssl all all 0.0.0.0/0 md5

-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
SELECT pg_reload_conf();
```

### 3. ESP32 TLS Client Certificate

```bash
# Generate device certificate (one per ESP32)
openssl req -new -x509 -days 365 -nodes \
  -keyout esp32-001.key \
  -out esp32-001.crt \
  -subj "/CN=esp32-001.enigma.local"

# Embed in firmware header (convert to C format)
xxd -i esp32-001.crt > firmware/certs/esp32-001.h
xxd -i esp32-001.key > firmware/certs/esp32-001.key.h
```

---

## 🔄 Backup & Recovery

### Daily Backup Script

```bash
#!/bin/bash
# /opt/enigma/backup.sh

BACKUP_DIR="/backups/enigma"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="enigma_prod"
DB_USER="enigma"

# Create backup directory
mkdir -p "$BACKUP_DIR/$TIMESTAMP"

# PostgreSQL dump
PGPASSWORD="$DB_PASSWORD" pg_dump -h localhost -U "$DB_USER" \
  -F custom "$DB_NAME" \
  -f "$BACKUP_DIR/$TIMESTAMP/db_$TIMESTAMP.dump"

# Compress
gzip -9 "$BACKUP_DIR/$TIMESTAMP/db_$TIMESTAMP.dump"

# Keep only last 30 days
find "$BACKUP_DIR" -name "db_*.dump.gz" -mtime +30 -delete

# Verify backup
if [ -f "$BACKUP_DIR/$TIMESTAMP/db_$TIMESTAMP.dump.gz" ]; then
  echo "✅ Backup successful: $TIMESTAMP" | \
    mail -s "ENIGMA Backup Report" ops@example.com
else
  echo "❌ Backup failed: $TIMESTAMP" | \
    mail -s "ENIGMA Backup FAILED" ops@example.com
  exit 1
fi
```

### Recovery Procedure

```bash
# Restore from backup
BACKUP_FILE="/backups/enigma/20231215_020000/db_20231215_020000.dump.gz"

# Stop all connections
psql -U enigma -d postgres -c \
  "SELECT pg_terminate_backend(pg_stat_activity.pid) 
   FROM pg_stat_activity 
   WHERE pg_stat_activity.datname = 'enigma_prod' 
   AND pid <> pg_backend_pid();"

# Drop and recreate database
dropdb -U enigma enigma_prod
createdb -U enigma enigma_prod

# Restore backup
gunzip -c "$BACKUP_FILE" | \
  pg_restore -U enigma enigma_prod

# Verify
psql -U enigma -d enigma_prod -c "\dt"
```

---

## 📈 Performance Optimization

### Database Tuning

```sql
-- Connection pooling (PgBouncer)
-- Edit pgbouncer.ini:
[databases]
enigma_prod = host=localhost port=5432 dbname=enigma_prod

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 30

-- Enable indexes for common queries
CREATE INDEX idx_records_device_created 
  ON entropy_records(device_id, created_at DESC);

CREATE INDEX idx_records_verified 
  ON entropy_records(verified_at DESC) 
  WHERE verified_at IS NOT NULL;

-- Analyze and vacuum
ANALYZE entropy_records;
VACUUM FULL entropy_records;

-- View query statistics
SELECT query, mean_time, max_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### FastAPI Optimization

```python
# config.py
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.backends.redis import RedisBackend
from redis import asyncio as aioredis

# Rate limiting
async def startup():
    redis = await aioredis.from_url("redis://localhost")
    await FastAPILimiter.init(RedisBackend(redis), key_func=get_client_ip)

app.add_event_handler("startup", startup)

# Caching
from fastapi_cache2 import FastAPICache2
from fastapi_cache2.backends.redis import RedisBackend

# Cache query results (5 minute TTL)
@app.get("/records/{device_id}")
@cached(expire=300)
async def get_device_records(device_id: str):
    ...

# Response compression
from fastapi.middleware.gzip import GZIPMiddleware
app.add_middleware(GZIPMiddleware, minimum_size=1000)
```

---

## 🚨 Operational Procedures

### Health Check Script

```bash
#!/bin/bash
# /opt/enigma/healthcheck.sh

ERRORS=0

# Check PostgreSQL
psql -U enigma -d enigma_prod -c "SELECT 1" 2>/dev/null || {
  echo "❌ Database unreachable"
  ((ERRORS++))
}

# Check Backend
curl -s http://localhost:8000/health | jq .status || {
  echo "❌ Backend not responding"
  ((ERRORS++))
}

# Check Frontend
curl -s https://enigma.example.com/ | grep -q "ENIGMA" || {
  echo "❌ Frontend not reachable"
  ((ERRORS++))
}

# Check disk space
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | cut -d% -f1)
if [ "$DISK_USAGE" -gt 85 ]; then
  echo "⚠️  Disk usage: $DISK_USAGE%"
  ((ERRORS++))
fi

# Check verification failure rate
FAILURES=$(psql -U enigma -d enigma_prod -t -c \
  "SELECT COUNT(*) FROM entropy_records WHERE verified_at IS NULL 
   AND created_at > NOW() - INTERVAL '5 minutes'")
if [ "$FAILURES" -gt 100 ]; then
  echo "⚠️  High verification failures: $FAILURES"
  ((ERRORS++))
fi

# Report
if [ $ERRORS -eq 0 ]; then
  echo "✅ All systems operational"
  exit 0
else
  echo "⚠️  $ERRORS issues detected"
  exit 1
fi
```

### Log Rotation

```bash
# /etc/logrotate.d/enigma

/logs/enigma/*.log {
  daily
  rotate 30
  compress
  delaycompress
  notifempty
  create 0640 enigma enigma
  sharedscripts
  postrotate
    systemctl reload docker
  endscript
}
```

---

## 🎯 Success Criteria

✅ **System is production-ready when:**

1. All TLS certificates valid (not self-signed)
2. All monitoring dashboards green
3. No verification failures over 24 hours
4. Backups completing daily with verification
5. Zero data loss during failover test
6. Latency p95 < 500ms across all requests
7. ESP32 devices maintaining 99.9% uptime
8. Database replication lag < 100ms
9. All security alerts acknowledged
10. Runbooks documented for all on-call procedures

---

**Deployment Status:** ✅ Ready for Production  
**Next Step:** Execute deployment checklist
