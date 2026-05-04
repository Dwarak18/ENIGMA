# Integration Guide: Deterministic Entropy Pipeline

## Overview

This guide walks through integrating the deterministic entropy pipeline components into the ENIGMA system. The pipeline consists of:

1. **Frontend Camera Module** (`frontend/src/modules/cameraEntropyPipeline.js`)
2. **Backend API** (`backend/src/routes/entropyPipeline.js`)
3. **PostgreSQL Schema** (`database/entropy_pipeline_schema.sql`)
4. **Documentation** (`docs/DETERMINISTIC_PIPELINE.md`)

---

## Step 1: Database Setup

### 1.1 Create Database Schema

```bash
cd database
psql -U postgres -d enigma_db -f entropy_pipeline_schema.sql
```

**Verify**:
```bash
psql -U postgres -d enigma_db -c "\dt entropy_*"
```

Expected output:
```
          List of relations
 Schema |          Name           | Type  
--------+-------------------------+-------
 public | entropy_error_log       | table
 public | entropy_pipeline        | table
 public | entropy_verification_log| table
 public | capture_records         | table
```

### 1.2 Verify Indexes and Views

```bash
psql -U postgres -d enigma_db -c "\di entropy_*"
psql -U postgres -d enigma_db -c "\dv entropy_*"
```

---

## Step 2: Backend Integration

### 2.1 Register Route Handler

Edit `backend/src/server.js`:

```javascript
// ... existing imports ...
const entropyPipelineRoutes = require('./routes/entropyPipeline');

// ... after other middleware setup ...

// Register entropy pipeline routes
app.use('/api/v1/entropy', entropyPipelineRoutes);

// ... rest of app initialization ...
```

### 2.2 Verify Dependencies

Ensure these are installed in `backend/package.json`:

```json
{
  "dependencies": {
    "express": "^4.x",
    "pg": "^8.x",
    "uuid": "^9.x",
    "crypto": "built-in",
    "dotenv": "^16.x"
  }
}
```

Install if needed:
```bash
cd backend
npm install uuid
```

### 2.3 Test Backend Endpoint

```bash
# Start backend server
cd backend
npm run dev

# In another terminal, test the endpoint:
curl -X POST http://localhost:3000/api/v1/entropy \
  -H "Content-Type: application/json" \
  -d '{
    "frameId": "550e8400-e29b-41d4-a716-446655440000",
    "entropyHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
    "frameCount": 100,
    "captureDurationMs": 10015
  }'
```

Expected response:
```json
{
  "ok": true,
  "recordId": "...",
  "entropyHash": "a1b2c3d4...",
  "nextStages": {
    "esp32Encryption": "/api/v1/entropy/.../encrypt",
    "blockchainAnchor": "/api/v1/entropy/.../anchor",
    "verification": "/api/v1/entropy/.../verify"
  }
}
```

---

## Step 3: Frontend Integration

### 3.1 Add Frontend Module

File is already created at: `frontend/src/modules/cameraEntropyPipeline.js`

### 3.2 Create a Camera Page Component

Example: `frontend/src/pages/CameraEntropyPage.jsx`

```javascript
import { useState, useRef, useEffect } from 'react';
import { runCompleteCaptureWorkflow } from '../modules/cameraEntropyPipeline.js';

export default function CameraEntropyPage() {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleCapture = async () => {
    setStatus('capturing');
    setError(null);
    
    try {
      // Run frontend entropy pipeline
      const entropy = await runCompleteCaptureWorkflow(videoRef.current);
      console.log('Captured entropy:', entropy);
      
      // Send to backend
      const res = await fetch('/api/v1/entropy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entropy)
      });
      
      if (!res.ok) {
        throw new Error(`Backend error: ${res.status}`);
      }
      
      const data = await res.json();
      setResult(data);
      setStatus('success');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <div>
      <h1>Camera Entropy Capture</h1>
      <video ref={videoRef} autoPlay playsInline style={{width: '100%'}} />
      
      <button onClick={handleCapture} disabled={status === 'capturing'}>
        {status === 'capturing' ? 'Capturing...' : 'Start Capture (10s)'}
      </button>
      
      {error && <div style={{color: 'red'}}>{error}</div>}
      
      {result && (
        <div>
          <h2>Result</h2>
          <p>Record ID: {result.recordId}</p>
          <p>Status: {result.verification.verified ? 'Verified ✓' : 'Failed ✗'}</p>
          <p>Next step: <a href={result.nextStages.esp32Encryption}>Prepare encryption</a></p>
        </div>
      )}
    </div>
  );
}
```

### 3.3 Update Frontend Routes

Add to `frontend/src/App.jsx`:

```javascript
import CameraEntropyPage from './pages/CameraEntropyPage';

function App() {
  return (
    <Routes>
      {/* ... existing routes ... */}
      <Route path="/entropy" element={<CameraEntropyPage />} />
    </Routes>
  );
}
```

### 3.4 Test Frontend Module Locally

```bash
cd frontend
npm install
npm run dev

# Open http://localhost:5173/entropy in browser
# Click "Start Capture" button
# Monitor browser console for logs
```

---

## Step 4: End-to-End Testing

### 4.1 Startup Checklist

- [ ] PostgreSQL running and schema applied
- [ ] Backend server running on port 3000
- [ ] Frontend dev server running on port 5173
- [ ] Hardhat local RPC running (optional, for blockchain tests)

### 4.2 Test Pipeline Flow

```bash
# 1. Capture entropy (frontend)
# - Open http://localhost:5173/entropy
# - Click "Start Capture"
# - Wait 10 seconds
# - Check console output

# 2. Verify backend received it
curl http://localhost:3000/api/v1/entropy/{recordId}

# 3. Test ESP32 encryption preparation
curl -X POST http://localhost:3000/api/v1/entropy/{recordId}/encrypt

# 4. Test blockchain anchoring (requires ESP32 data)
curl -X POST http://localhost:3000/api/v1/entropy/{recordId}/anchor \
  -H "Content-Type: application/json" \
  -d '{
    "aesKeyHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
    "sntp_time": 1714866255
  }'

# 5. Verify integrity
curl http://localhost:3000/api/v1/entropy/{recordId}/verify
```

### 4.3 Database Inspection

```bash
# Check stored records
psql -U postgres -d enigma_db -c "SELECT * FROM entropy_pipeline;"

# Check pipeline status
psql -U postgres -d enigma_db -c "SELECT * FROM entropy_pipeline_status;"

# Check errors (if any)
psql -U postgres -d enigma_db -c "SELECT * FROM entropy_error_log;"
```

---

## Step 5: Error Handling

### 5.1 Common Errors and Solutions

#### Camera Permission Denied
```javascript
// Error code: ERROR_CAMERA_PERMISSION
// Solution: 
// 1. Check browser permission settings
// 2. Ensure HTTPS (required by browsers)
// 3. Check camera is not in use by another app
```

#### Insufficient Entropy
```javascript
// Error code: ERROR_INSUFFICIENT_ENTROPY
// Solution:
// 1. Ensure camera is capturing (good lighting helps)
// 2. Check frame count (should be ~100 for 10 FPS @ 10s)
// 3. Verify LSB extraction is working
```

#### Hash Mismatch
```javascript
// Backend error: HASH_MISMATCH
// Solution:
// 1. Check rawEntropyHex is correct
// 2. Verify SHA-256 computation
// 3. Check data wasn't corrupted in transit
```

#### Database Connection Error
```javascript
// Backend error: INTERNAL_ERROR with database issue
// Solution:
// 1. Verify PostgreSQL is running
// 2. Check connection string in .env
// 3. Verify schema was created
```

### 5.2 Logging and Monitoring

Add to backend routes for better debugging:

```javascript
// In entropyPipeline.js, add logging
console.log('[ENTROPY] POST /entropy received from:', deviceId);
console.log('[ENTROPY] Frame ID:', validated.frameId);
console.log('[ENTROPY] Hash verification:', hashVerification.verified);
console.log('[ENTROPY] Stored record:', stored.id);
```

Monitor logs:
```bash
# Watch backend logs
tail -f backend.log | grep ENTROPY

# Watch database activity
psql -U postgres -d enigma_db -c "WATCH SELECT * FROM entropy_pipeline ORDER BY stored_at DESC LIMIT 5;"
```

---

## Step 6: Performance Testing

### 6.1 Measure Component Performance

```javascript
// Test camera initialization
const t1 = performance.now();
const initResult = await initializeCamera(videoElement);
const t2 = performance.now();
console.log(`Camera init: ${(t2 - t1).toFixed(2)}ms`);

// Test entropy capture
const t3 = performance.now();
const entropy = await captureEntropyPipeline(videoElement);
const t4 = performance.now();
console.log(`Entropy capture: ${(t4 - t3).toFixed(2)}ms`);

// Test backend
const t5 = performance.now();
const res = await fetch('/api/v1/entropy', { ... });
const t6 = performance.now();
console.log(`Backend validation: ${(t6 - t5).toFixed(2)}ms`);
```

### 6.2 Load Testing

```bash
# Test backend with multiple concurrent captures
ab -n 100 -c 10 -p entropy.json -T application/json http://localhost:3000/api/v1/entropy

# Monitor database performance
psql -U postgres -d enigma_db -c "EXPLAIN ANALYZE SELECT * FROM entropy_pipeline ORDER BY stored_at DESC LIMIT 10;"
```

---

## Step 7: Deployment Preparation

### 7.1 Environment Configuration

Create `.env` file:

```bash
# Backend
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://user:pass@localhost:5432/enigma_db
LOG_LEVEL=info

# Frontend
VITE_API_URL=http://localhost:3000
VITE_BACKEND_URL=http://localhost:3000
```

### 7.2 Docker Setup (Optional)

Create `docker-compose.override.yml` for entropy pipeline services:

```yaml
version: '3.8'
services:
  postgresql:
    environment:
      POSTGRES_DB: enigma_db
    volumes:
      - ./database/entropy_pipeline_schema.sql:/docker-entrypoint-initdb.d/05-entropy-schema.sql

  backend:
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgresql:5432/enigma_db
```

### 7.3 CI/CD Integration

Add to GitHub Actions workflow:

```yaml
- name: Test Entropy Pipeline
  run: |
    cd backend
    npm test -- entropy
    cd ../database
    psql $DATABASE_URL -f entropy_pipeline_schema.sql
```

---

## Step 8: Security Hardening

### 8.1 HTTPS Configuration

```javascript
// In backend server setup
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('private-key.pem'),
  cert: fs.readFileSync('certificate.pem')
};

https.createServer(options, app).listen(3000);
```

### 8.2 Input Validation

Already implemented in `entropyPipeline.js`, but ensure:

```javascript
// Validate all inputs
const validated = validateEntropyStructure(req.body);

// Verify hashes
if (req.body.rawEntropyHex) {
  const verification = verifyEntropyHash(...);
  if (!verification.verified) {
    return res.status(400).json({ ok: false, code: 'HASH_MISMATCH' });
  }
}
```

### 8.3 Database Security

```bash
# Restrict database access
psql -U postgres -c "REVOKE CONNECT ON DATABASE enigma_db FROM PUBLIC;"
psql -U postgres -c "GRANT CONNECT ON DATABASE enigma_db TO app_user;"

# Create restricted user
psql -U postgres -c "CREATE USER app_user WITH PASSWORD 'strong_password';"
psql -U postgres -d enigma_db -c "GRANT ALL ON SCHEMA public TO app_user;"
```

---

## Step 9: Monitoring and Alerts

### 9.1 Set Up Monitoring

Track these metrics:

```sql
-- Hourly entropy captures
SELECT 
  date_trunc('hour', stored_at) as hour,
  COUNT(*) as captures,
  COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified
FROM entropy_pipeline
GROUP BY hour
ORDER BY hour DESC;

-- Error rate
SELECT 
  pipeline_stage,
  COUNT(*) as error_count,
  COUNT(*) * 100.0 / (SELECT COUNT(*) FROM entropy_error_log) as percent
FROM entropy_error_log
GROUP BY pipeline_stage
ORDER BY error_count DESC;
```

### 9.2 Alert Conditions

```javascript
// Alert if capture success rate drops below 95%
const successRate = verifiedCount / totalCount;
if (successRate < 0.95) {
  alertSlack(`Entropy success rate: ${(successRate * 100).toFixed(1)}%`);
}

// Alert if blockchain anchoring fails
if (blockchainErrors > 0) {
  alertSlack(`Blockchain errors detected: ${blockchainErrors}`);
}
```

---

## Step 10: Documentation and Training

### 10.1 API Documentation

See: `docs/API_REFERENCE.md` (included in repo)

### 10.2 Architecture Documentation

See: `docs/DETERMINISTIC_PIPELINE.md` (included in repo)

### 10.3 Team Training

- [ ] Review `copilot.md` for architecture overview
- [ ] Review `skills.md` for technical concepts
- [ ] Walkthrough integration checklist above
- [ ] Hands-on testing of all endpoints

---

## Troubleshooting

### Issue: Camera not accessible in browser
**Solution**: Check HTTPS, permissions, check if another app is using camera

### Issue: Backend validation failures
**Solution**: Check request body format, verify entropy hash is 64-char hex

### Issue: Database connection errors
**Solution**: Verify PostgreSQL is running, check connection string

### Issue: Blockchain anchoring fails
**Solution**: Verify Hardhat RPC is running, check contract deployment

### Issue: Timing validation errors
**Solution**: Ensure capture takes exactly 10 seconds (±10% tolerance)

---

## Next Steps

1. ✅ Integrate database schema
2. ✅ Register backend routes
3. ✅ Test backend endpoints
4. ✅ Integrate frontend module
5. ⏳ Implement ESP32 AES encryption
6. ⏳ Update Hardhat smart contract
7. ⏳ Run full end-to-end integration tests
8. ⏳ Set up monitoring and alerting
9. ⏳ Deploy to production

---

## Support

For questions or issues:
- Check `docs/DETERMINISTIC_PIPELINE.md` for architecture
- Check `docs/API_REFERENCE.md` for API details
- Review error codes in integration guide
- Check database logs and backend logs

