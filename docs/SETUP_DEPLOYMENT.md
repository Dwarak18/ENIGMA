# ENIGMA Setup & Deployment Guide

Complete step-by-step guide for setting up ENIGMA in development, testing, and production environments.

## 📋 Table of Contents

1. [System Requirements](#system-requirements)
2. [Docker Compose Setup](#docker-compose-setup)
3. [Local Development Setup](#local-development-setup)
4. [Production Deployment](#production-deployment)
5. [Troubleshooting](#troubleshooting)

---

## System Requirements

### Hardware
- **Minimum:** 2 CPU cores, 2GB RAM, 10GB disk
- **Recommended:** 4 CPU cores, 4GB RAM, 20GB disk
- **Camera:** USB webcam or integrated laptop camera

### Software

#### Docker Deployment
- Docker 20.10+
- Docker Compose 2.0+

#### Local Development
- Python 3.11 or higher
- Node.js 18.0 or higher
- PostgreSQL 15 or higher
- Git

#### Operating System
- Linux (Ubuntu 20.04+, Debian 11+)
- macOS (11+)
- Windows 10+ (with Docker Desktop or WSL2)

---

## Docker Compose Setup (Recommended)

### Step 1: Clone & Navigate

```bash
git clone https://github.com/your-repo/ENIGMA.git
cd ENIGMA
```

### Step 2: Configure Environment

```bash
# Backend configuration
cp backend/.env.example backend/.env

# Edit for your environment (optional - defaults work for local testing)
nano backend/.env
```

**Key Configuration Variables:**

| Variable | Development | Production |
|----------|-------------|-----------|
| `DATABASE_URL` | `postgresql://enigma:changeme@postgres:5432/enigma_db` | Use strong password |
| `DEBUG` | `True` | `False` |
| `SERVER_RANDOM_SEED` | `dev-seed` | Generate 32+ random bytes |
| `CORS_ORIGINS` | `http://localhost:*` | Your domain only |

### Step 3: Start Services

```bash
# Build and start all services
docker compose up -d --build

# Verify services are healthy
docker compose ps

# Expected output:
#   postgres    healthy
#   backend     healthy
#   frontend    running
```

### Step 4: Verify Deployment

```bash
# Wait 30 seconds for services to fully initialize

# Health check
curl http://localhost:8000/health

# Get statistics
curl http://localhost:8000/statistics

# Access frontend
open http://localhost
```

### Step 5: Create Sample Device

```bash
curl -X POST http://localhost:8000/devices \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device-001",
    "public_key": "04' + '0'*128 + '"
  }'
```

### Step 6: Test Capture & Verification

#### Option A: Using Frontend
1. Open http://localhost in browser
2. Navigate to **Cameras** tab
3. Set Device ID: `test-device-001`
4. Click **Capture & Encrypt Frame**
5. Copy Record ID
6. Go to **Verification** tab
7. Paste Record ID and verify

#### Option B: Using curl

```bash
# Create a test image (100x100 red PNG)
python3 << 'EOF'
from PIL import Image
import base64

img = Image.new('RGB', (100, 100), color='red')
img.save('/tmp/test.png')

with open('/tmp/test.png', 'rb') as f:
    encoded = base64.b64encode(f.read()).decode()
    print(encoded)
EOF

# Capture entropy
RECORD_ID=$(curl -s -X POST http://localhost:8000/capture \
  -H "Content-Type: application/json" \
  -d '{
    "image": "'$(cat /tmp/b64_image.txt)'",
    "device_id": "test-device-001"
  }' | jq -r '.id')

echo "Captured Record ID: $RECORD_ID"

# Verify
curl -X POST http://localhost:8000/verify/$RECORD_ID
```

### Stopping Services

```bash
# Stop and keep volumes
docker compose down

# Stop and remove everything (including database!)
docker compose down -v
```

---

## Local Development Setup

### Backend Setup

#### Step 1: Install Python & Dependencies

```bash
# Navigate to backend
cd backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt
```

#### Step 2: Set Up PostgreSQL

**Option A: Local PostgreSQL**
```bash
# Linux (Ubuntu)
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb enigma_db
sudo -u postgres createuser enigma
sudo -u postgres psql -c "ALTER USER enigma PASSWORD 'changeme';"

# macOS (Homebrew)
brew install postgresql
brew services start postgresql
createdb enigma_db
createuser enigma
psql postgres -c "ALTER USER enigma PASSWORD 'changeme';"

# Windows (WSL2)
apt-get install postgresql postgresql-contrib
service postgresql start
```

**Option B: Docker Container**
```bash
docker run -d \
  --name enigma-postgres \
  -e POSTGRES_DB=enigma_db \
  -e POSTGRES_USER=enigma \
  -e POSTGRES_PASSWORD=changeme \
  -p 5432:5432 \
  -v enigma-postgres:/var/lib/postgresql/data \
  postgres:15-alpine
```

#### Step 3: Configure Backend

```bash
# Create .env file from example
cp .env.example .env

# Edit configuration
nano .env

# Key settings:
# DATABASE_URL=postgresql://enigma:changeme@localhost:5432/enigma_db
# DEBUG=True
# SERVER_RANDOM_SEED=dev-seed-12345
```

#### Step 4: Initialize Database

```bash
# Create tables
python3 << 'EOF'
from app.database import init_db
init_db()
print("✓ Database initialized")
EOF
```

#### Step 5: Start FastAPI Server

```bash
# Development with auto-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production (no reload)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

**Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

### Frontend Setup

#### Step 1: Install Node Dependencies

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install
```

#### Step 2: Start Development Server

```bash
# Start Vite dev server
npm run dev

# Output:
#   VITE v5.0.8  ready in 234 ms
#   ➜  Local:   http://localhost:5173/
#   ➜  press h to show help
```

#### Step 3: Access Application

Open http://localhost:5173 in your browser. The frontend will automatically proxy API calls to http://localhost:8000.

### Testing Integration

In one terminal:
```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```

In another terminal:
```bash
# Terminal 2: Frontend
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Change all default passwords
- [ ] Generate strong `SERVER_RANDOM_SEED`
- [ ] Set `DEBUG=False`
- [ ] Configure proper `CORS_ORIGINS`
- [ ] Set up SSL/TLS certificates
- [ ] Configure database backups
- [ ] Set up monitoring & logging
- [ ] Plan disaster recovery

### Deployment Option 1: Docker Compose (Recommended)

#### Step 1: Prepare Server

```bash
# Install Docker & Compose
sudo apt-get update
sudo apt-get install docker.io docker-compose

# Add user to docker group
sudo usermod -aG docker $USER

# Verify
docker --version
```

#### Step 2: Prepare Configuration

```bash
# Clone repository
git clone https://github.com/your-repo/ENIGMA.git /opt/enigma
cd /opt/enigma

# Generate secure server seed
SERVER_SEED=$(openssl rand -hex 32)
echo "SERVER_RANDOM_SEED=$SERVER_SEED" >> backend/.env

# Set production values
cat >> backend/.env << EOF
DEBUG=False
CORS_ORIGINS=["https://your-domain.com"]
DATABASE_URL=postgresql://enigma:$(openssl rand -base64 16)@postgres:5432/enigma_db
EOF
```

#### Step 3: Configure Nginx (Optional but Recommended)

Create `/opt/enigma/nginx.conf`:

```nginx
upstream backend {
    server backend:8000;
}

server {
    listen 443 ssl http2;
    server_name your-api-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # API requests to FastAPI
    location /api/ {
        proxy_pass http://backend/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files & SPA
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name your-api-domain.com;
    return 301 https://$server_name$request_uri;
}
```

#### Step 4: Start with Docker Compose

```bash
# Build production image
docker compose -f docker-compose.yml build

# Start services
docker compose -f docker-compose.yml up -d

# Verify
docker compose ps

# Check logs
docker compose logs -f backend
```

#### Step 5: Set Up Monitoring

```bash
# Monitor logs
docker compose logs -f

# Check resource usage
docker stats

# Health monitoring
watch -n 5 'curl -s http://localhost:8000/health | jq'
```

### Deployment Option 2: Kubernetes (Advanced)

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: enigma-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: enigma-backend
  template:
    metadata:
      labels:
        app: enigma-backend
    spec:
      containers:
      - name: backend
        image: enigma-backend:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: enigma-secrets
              key: database-url
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: enigma-backend
spec:
  selector:
    app: enigma-backend
  ports:
  - port: 8000
    targetPort: 8000
  type: LoadBalancer
```

Deploy:
```bash
# Create secrets
kubectl create secret generic enigma-secrets \
  --from-literal=database-url='postgresql://...'

# Deploy
kubectl apply -f k8s/deployment.yaml

# Verify
kubectl get pods
kubectl logs deployment/enigma-backend
```

### Backups & Recovery

#### Backup PostgreSQL

```bash
# Daily automated backup
docker compose exec postgres pg_dump -U enigma enigma_db > backups/enigma_$(date +%Y%m%d_%H%M%S).sql

# Or add to crontab
# 0 2 * * *  docker compose -f /opt/enigma/docker-compose.yml exec -T postgres pg_dump -U enigma enigma_db > /backups/enigma_$(date +\%Y\%m\%d).sql
```

#### Restore PostgreSQL

```bash
docker compose exec postgres psql -U enigma enigma_db < backups/enigma_backup.sql
```

### Monitoring & Logging

#### Application Metrics

```bash
# Real-time statistics
curl http://localhost:8000/statistics | jq

# Device health
curl http://localhost:8000/health | jq
```

#### Log Aggregation (Optional)

Setup with ELK Stack or similar:

```yaml
# Add to docker-compose.yml
  logstash:
    image: docker.elastic.co/logstash/logstash:7.14.0
    environment:
      - "LS_JAVA_OPTS=-Xmx256m -Xms256m"
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    depends_on:
      - elasticsearch
    networks:
      - enigma_net
```

---

## Troubleshooting

### Docker Compose Issues

#### Backend won't start
```bash
# Check logs
docker compose logs backend

# Common issues:
# 1. PostgreSQL not ready - wait 30 seconds
# 2. DATABASE_URL incorrect - verify .env
# 3. Port 8000 already in use - check: lsof -i :8000
```

#### PostgreSQL connection refused
```bash
# Verify PostgreSQL is running
docker compose ps | grep postgres

# Get database status
docker compose exec postgres pg_isready -U enigma

# Recreate database
docker compose down -v  # Destructive!
docker compose up -d
```

#### Frontend can't connect to backend
```bash
# Check Nginx reverse proxy
docker compose logs frontend | grep -i error

# Test API directly
curl http://localhost:8000/health

# Browser console (F12) should show API calls
```

### Local Development Issues

#### ImportError: No module named 'cv2'
```bash
# Reinstall OpenCV
pip uninstall opencv-python
pip install opencv-python --no-cache-dir

# Or compile from source
pip install opencv-python-headless  # For servers without display
```

#### Database connection refused
```bash
# Verify PostgreSQL is running
psql -U enigma -d enigma_db -c "SELECT 1"

# Start PostgreSQL
sudo systemctl start postgresql  # Linux
brew services start postgresql   # macOS

# Check connection string in .env
cat backend/.env | grep DATABASE_URL
```

#### Camera permission denied
```bash
# Browser: Check camera permission in settings
# Linux: Add user to video group
sudo usermod -aG video $USER

# Windows: Check Windows Settings > Privacy > Camera
```

#### Port already in use
```bash
# Find process using port
lsof -i :8000
lsof -i :5173
lsof -i :5432

# Kill if needed
kill -9 <PID>

# Or change port in code/config
```

### Performance Issues

#### Slow image processing
```bash
# Check image size constraints (backend/.env)
MIN_IMAGE_SIZE=100
MAX_IMAGE_SIZE=1920

# Use smaller images for testing
```

#### Database queries slow
```bash
# Check PostgreSQL index
docker compose exec postgres psql -U enigma -d enigma_db << EOF
  CREATE INDEX idx_entropy_device_timestamp 
    ON entropy_records(device_id, created_at DESC);
  CREATE INDEX idx_entropy_timestamp 
    ON entropy_records(created_at DESC);
EOF
```

#### Memory usage high
```bash
# Check Docker stats
docker stats

# Limit memory in docker-compose.yml
services:
  backend:
    mem_limit: 512m
    memswap_limit: 1g
```

---

## Security Hardening

### Production Checklist

```bash
# 1. Generate strong SERVER_RANDOM_SEED
openssl rand -hex 32

# 2. Set secure PostgreSQL password
openssl rand -base64 16

# 3. Enable CORS for your domain only
CORS_ORIGINS=["https://your-domain.com"]

# 4. Set DEBUG=False
DEBUG=False

# 5. Use HTTPS/TLS (Let's Encrypt)
certbot certonly --standalone -d your-domain.com

# 6. Run as non-root in containers
USER: 1000:1000  # Already configured in Dockerfile

# 7. Use network security group rules
# Allow: 443 (HTTPS), 22 (SSH) only
# Deny: 3000, 5432, 8000 from public

# 8. Set up firewall
sudo ufw enable
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## Support & Troubleshooting

- Check logs: `docker compose logs <service>`
- Test API: `curl http://localhost:8000/health`
- Browser console: F12 → Console tab
- GitHub Issues: Report bugs with full error logs

---

**Version:** 1.0  
**Last Updated:** 2024-01-15  
**Status:** Production-Ready
