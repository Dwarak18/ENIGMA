# ENIGMA Testing Guide

Complete instructions for unit tests, integration tests, and end-to-end testing.

---

## Testing Overview

| Test Type | Location | Command | Purpose |
|-----------|----------|---------|---------|
| **Unit Tests** | `backend/tests/` | `npm test` | Test individual services (crypto, validation) |
| **Integration Tests** | `frontend/tests/` | `npm test` | Test components + API calls |
| **E2E Tests** | `tests/e2e/` | `npm run test:e2e` | Test full system workflow |
| **Firmware Simulator** | `firmware/simulate.py` | `python simulate.py` | Test crypto pipeline offline |
| **Linting** | Root | `npm run lint` | Code quality checks |

---

## Backend Testing

### **Unit Tests**

Test individual services and utilities in isolation.

#### Setup

```bash
cd backend
npm install
```

#### Run All Tests

```bash
npm test
```

#### Run Specific Test File

```bash
npm test -- entropy.test.js
```

#### Watch Mode (Auto-run on changes)

```bash
npm test -- --watch
```

#### Coverage Report

```bash
npm test -- --coverage
```

### **Test Structure**

Backend tests use **Jest** framework. Example:

```javascript
// backend/tests/entropy.test.js
describe('Entropy Service', () => {
  describe('processEntropy()', () => {
    it('should accept valid entropy submission', async () => {
      const payload = {
        device_id: 'TEST_DEVICE',
        timestamp: new Date().toISOString(),
        entropy_hash: '291a598a8a0a2bf645954c55b4bb1694...',
        signature: 'ca06f135f83ae0855f482e0ee5f0e5a5...',
        public_key: '0429af20ab43c0b040bd...'
      };
      
      const result = await entropyService.processEntropy(payload);
      expect(result).toHaveProperty('id');
      expect(result.status).toBe('anchored');
    });

    it('should reject stale timestamps', async () => {
      const staleTime = new Date(Date.now() - 70000).toISOString();
      const payload = {
        device_id: 'TEST_DEVICE',
        timestamp: staleTime,
        entropy_hash: '...',
        signature: '...',
        public_key: '...'
      };
      
      await expect(entropyService.processEntropy(payload))
        .rejects
        .toThrow('STALE_TIMESTAMP');
    });

    it('should reject invalid signatures', async () => {
      const payload = {
        device_id: 'TEST_DEVICE',
        timestamp: new Date().toISOString(),
        entropy_hash: '291a598a8a0a2bf645954c55b4bb1694...',
        signature: 'ffffffffffffffffffffffffffffffff...', // Invalid
        public_key: '0429af20ab43c0b040bd...'
      };
      
      await expect(entropyService.processEntropy(payload))
        .rejects
        .toThrow('INVALID_SIGNATURE');
    });
  });
});
```

### **Available Tests**

Currently defined test file: `backend/tests/entropy.test.js`

**Note:** Backend `package.json` does not currently wire a test runner (Jest). To run tests:

```bash
# Install Jest
npm install --save-dev jest

# Add to package.json:
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}

# Run tests
npm test
```

---

## Frontend Testing

### **Unit & Component Tests**

Test React components in isolation.

#### Setup

```bash
cd frontend
npm install
```

#### Run Tests

```bash
npm test
```

**Note:** Frontend `package.json` does not currently have a test script. To add:

```bash
# Install Vitest (recommended for Vite)
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom

# Create frontend/vitest.config.js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: { globals: true, environment: 'jsdom' }
});

# Add to package.json:
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

#### Example Test

```javascript
// frontend/src/pages/CamerasPage.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CamerasPage from './CamerasPage';

describe('CamerasPage', () => {
  it('should render camera list', () => {
    render(<CamerasPage />);
    expect(screen.getByText(/Camera Feed/i)).toBeInTheDocument();
  });

  it('should capture image on button click', async () => {
    const user = userEvent.setup();
    render(<CamerasPage />);
    
    const captureBtn = screen.getByRole('button', { name: /Capture/i });
    await user.click(captureBtn);
    
    // Verify API call was made
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/image-streams/capture'),
      expect.any(Object)
    );
  });
});
```

---

## Firmware Testing

### **Offline Simulation (Python)**

Test cryptographic pipeline without physical ESP32.

#### Setup

```bash
cd firmware
pip install -r requirements.txt
```

#### Run Simulator

```bash
# Run against local backend
BACKEND_URL=http://127.0.0.1:3000 python simulate.py
```

#### Simulator Output

The simulator will:
1. Generate ECDSA keypair (P-256)
2. Generate AES-256 key
3. Connect to backend WebSocket
4. Emit entropy every 3-10 seconds
5. Display crypto validation logs

Example output:
```
[2026-05-02 19:40:00] Entropy submitted for device: SIM_DEVICE_001
[2026-05-02 19:40:00] AES Key: 291a598a8a0a2bf645954c55b4bb1694...
[2026-05-02 19:40:00] Hash: ca06f135f83ae0855f482e0ee5f0e5a5...
[2026-05-02 19:40:00] Signature: d3a4f2b5c7e8f1a2b3c4d5e6f7a8b9c0...
[2026-05-02 19:40:00] WebSocket message broadcast to all clients
```

#### Verify Simulator Crypto

```bash
# Standalone crypto test (no backend)
python -c "
from simulate import SimulatedDevice
device = SimulatedDevice()
print('AES Key (hex):', device.aes_key.hex())
print('Public Key (hex):', device.get_public_key_hex())
print('Signature works:', device.sign(b'test').startswith(b''))
"
```

### **Firmware Build Validation**

#### Build for ESP32-S3

```bash
cd firmware
idf.py set-target esp32s3
idf.py build
```

#### Check Binary Size

```bash
idf.py size
idf.py size-components

# Output example:
# Total image size:0xbdd70 bytes (.bin may be padded larger)
# Allocated flash size: 0xc80000

# This leaves 26% free for OTA updates
```

#### Flash to Device

```bash
idf.py -p /dev/ttyUSB0 flash monitor

# Exit monitor: Ctrl+]
```

#### Monitor Serial Output

```bash
idf.py -p /dev/ttyUSB0 monitor

# Look for:
# [I] SNTP synced
# [I] WiFi connected
# [I] Waiting for UART payload
# [I] Payload received: <hex>
# [I] Encrypted: <hex>
# [I] Hash: <hex>
# [I] Signature: <hex>
```

---

## Integration Testing

### **Full Stack Test (Local)**

Test entire system: firmware → backend → frontend → blockchain

#### Prerequisites

```bash
# Terminal 1: Backend
cd backend
npm start
# Verify: curl http://localhost:3000/health

# Terminal 2: Frontend
cd frontend
npm run dev
# Verify: http://localhost:5173

# Terminal 3: Database
docker run -d -e POSTGRES_PASSWORD=password postgres:15
# or: brew services start postgresql

# Terminal 4: Firmware Simulator
cd firmware
python simulate.py
```

#### Test Workflow

1. **Open Frontend Dashboard**
   ```
   http://localhost:5173
   ```

2. **Monitor Entropy Submissions**
   - Watch "Recent Entropy" table populate
   - Verify device status shows "Online"

3. **Check Blockchain Anchoring**
   - Navigate to "Blockchain" tab
   - Verify pending anchors are submitted
   - Check anchor status transitions from pending → confirmed

4. **Verify Replay Protection**
   ```bash
   # Manually submit same entropy twice
   curl -X POST http://localhost:3000/api/v1/entropy \
     -H "Content-Type: application/json" \
     -d '{"device_id":"TEST","timestamp":"2026-05-02T19:40:00Z",...}'
   
   # First request: 200 OK
   # Second request: 409 Conflict (REPLAY_DETECTED)
   ```

5. **Verify Timestamp Validation**
   ```bash
   # Submit stale entropy (>60 seconds old)
   curl -X POST http://localhost:3000/api/v1/entropy \
     -H "Content-Type: application/json" \
     -d '{"device_id":"TEST","timestamp":"2026-05-01T19:40:00Z",...}'
   
   # Response: 400 Bad Request (STALE_TIMESTAMP)
   ```

### **WebSocket Integration Test**

```bash
# Test WebSocket connection
cd frontend

# In browser console:
const socket = io('http://localhost:3000');
socket.on('connect', () => console.log('Connected!'));
socket.on('entropy:new', (data) => console.log('Entropy:', data));
socket.on('trng:state', (data) => console.log('TRNG State:', data));
socket.on('device:status', (data) => console.log('Device Status:', data));

# Trigger an entropy submission
# Watch console logs for real-time updates
```

---

## End-to-End Testing

### **Complete System Validation**

Test device → firmware → backend → blockchain → verification.

#### Setup (requires ESP32-S3)

```bash
# 1. Connect ESP32-S3 to computer via USB
# 2. Identify COM port: Device Manager → Ports
# 3. Flash firmware
cd firmware
idf.py -p COM3 flash monitor

# 4. Configure device in backend
curl -X POST http://localhost:3000/api/v1/devices \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "ESP32_001",
    "public_key": "04...",
    "description": "Main TRNG ESP32"
  }'
```

#### Test Sequence

1. **Verify ESP32 Connects**
   ```bash
   # Monitor serial output
   idf.py -p COM3 monitor
   
   # Look for:
   # [I] SNTP synced: 2026-05-02T19:40:00Z
   # [I] WiFi connected to SSID
   # [I] Connecting to backend...
   # [I] Connected to http://localhost:3000
   ```

2. **Observe Entropy Submissions**
   ```bash
   # Monitor backend logs
   tail -f backend/logs/*.log
   
   # Look for:
   # POST /api/v1/entropy - device: ESP32_001 - sig: VALID - status: OK
   # Entropy ID: <uuid> - anchoring...
   ```

3. **Verify Blockchain Anchoring**
   ```bash
   # Monitor blockchain logs
   tail -f backend/logs/blockchain.log
   
   # Look for:
   # Submitting anchor for entropy <uuid>
   # Transaction hash: 0x...
   # Block number: 12345
   # Status: CONFIRMED
   ```

4. **Validate Frontend Display**
   - Open http://localhost:5173
   - Verify device status shows "Online"
   - Verify entropy records appear in real-time
   - Verify anchor status updates to "Confirmed"

5. **Perform Verification**
   - Navigate to "Verify" page
   - Enter entropy ID or timestamp
   - Verify signature check passes
   - Verify hash chain integrity

#### Expected Success Criteria

- [ ] Device appears as "Online" on dashboard
- [ ] Entropy submissions recorded every 10-20 seconds
- [ ] All signatures verify successfully
- [ ] Timestamps within ±60 second freshness window
- [ ] No replay attacks detected
- [ ] Blockchain anchors submitted within 30 seconds
- [ ] Hash chain integrity verified

---

## Stress Testing

### **Load Testing**

Test system under high entropy submission rates.

#### Using Simulator (10x Entropy Rate)

```bash
# Modify firmware/simulate.py
ENTROPY_INTERVAL_MIN = 0.5  # Default: 3 seconds
ENTROPY_INTERVAL_MAX = 1.5  # Default: 10 seconds

# Run simulator
python simulate.py &
python simulate.py &
python simulate.py &  # Run 3 instances simultaneously
```

#### Monitor Performance

```bash
# Check backend response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/health

# Check database connections
psql -U enigma -d enigma_db -c "SELECT count(*) FROM pg_stat_activity;"

# Check memory usage
ps aux | grep node

# Check disk I/O
iostat -x 1
```

#### Success Criteria

- [ ] Average response time < 100ms
- [ ] No 5xx errors
- [ ] Database connection pool not exhausted
- [ ] CPU usage < 80%
- [ ] Memory usage < 2GB
- [ ] Disk I/O not saturated

---

## Continuous Integration (GitHub Actions)

### **Automated Testing**

Runs on every push and pull request.

#### Example Workflow (`.github/workflows/test.yml`)

```yaml
name: Test

on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: enigma_test
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd backend && npm install
      - run: cd backend && npm test
      - run: cd backend && npm run lint

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd frontend && npm install
      - run: cd frontend && npm test
      - run: cd frontend && npm run build

  firmware:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: esp-rs/esp-idf-action@v1
      - run: cd firmware && idf.py build
```

---

## Debugging

### **Backend Debugging**

```bash
# Enable verbose logging
LOG_LEVEL=debug npm start

# Enable Node.js debugger
node --inspect backend/src/server.js
# Open chrome://inspect in Chrome
```

### **Frontend Debugging**

```bash
# Enable React DevTools
npm run dev
# Open DevTools (F12) → React tab

# Enable network logging
# DevTools → Network tab
# Watch API calls and WebSocket messages
```

### **Firmware Debugging**

```bash
# Monitor serial output with filtering
idf.py -p COM3 monitor | grep -E "ERROR|WARN|Entropy"

# Log to file
idf.py -p COM3 monitor > firmware.log 2>&1
tail -f firmware.log
```

---

## Test Checklist

### **Before Deployment**

- [ ] All backend unit tests passing (`npm test`)
- [ ] All frontend component tests passing
- [ ] No console errors in frontend (DevTools)
- [ ] Backend linting clean (`npm run lint`)
- [ ] Frontend linting clean
- [ ] Firmware builds without warnings (`idf.py build`)
- [ ] Simulator test passes (entropy → backend → blockchain)
- [ ] ESP32-S3 device test passes (firmware → backend → dashboard)
- [ ] Load test passes (1000+ submissions without errors)
- [ ] Signature verification never fails
- [ ] Replay protection blocks duplicates
- [ ] Timestamp validation rejects stale submissions
- [ ] WebSocket broadcasts work in real-time
- [ ] Blockchain anchoring completes successfully

### **Security Testing**

- [ ] Invalid signatures rejected (INVALID_SIGNATURE)
- [ ] Unknown devices rejected (UNKNOWN_DEVICE)
- [ ] Stale timestamps rejected (STALE_TIMESTAMP)
- [ ] Replayed submissions blocked (REPLAY_DETECTED)
- [ ] SQL injection payloads rejected
- [ ] XSS payloads escaped
- [ ] CORS headers prevent unauthorized access
- [ ] No sensitive data in logs

---

## References

- **Jest Documentation:** https://jestjs.io/
- **Vitest Documentation:** https://vitest.dev/
- **React Testing Library:** https://testing-library.com/
- **ESP-IDF Testing:** https://docs.espressif.com/projects/esp-idf/en/latest/esp32/contribute/esp-idf-tests-with-pytest.html

---

**Last Updated:** 2026-05-02
