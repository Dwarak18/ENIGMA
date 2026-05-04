# Metrics Collection & Analysis System

> ENIGMA performance measurement and visualization infrastructure

## Overview

This system measures **real latency, throughput, and cryptographic overhead** across the entire entropy pipeline:

```
Firmware (AES/ECDSA/SHA-256) 
  → Network transport 
  → Backend validation (signature verify, DB write)
  → Storage growth
```

All measurements use **actual wall-clock timestamps** from hardware and backend logs. No theoretical estimates.

---

## 1. Metrics Definition

### 1.1 End-to-End Latency

| Metric | Unit | Source | What It Measures |
|--------|------|--------|------------------|
| `total_latency` | ms | firmware_start → DB insert | Complete pipeline time |
| `capture_latency` | ms | input ready → encrypted | Capture + encode time |
| `encrypt_latency` | ms | AES start → encrypted output | AES-128-CBC duration |
| `hash_latency` | ms | hash start → final hash | SHA-256 computation |
| `sign_latency` | ms | signature start → signature | ECDSA signing (if present) |
| `serialize_latency` | ms | result ready → JSON sent | UART encoding + TX |
| `network_latency` | ms | UART recv → HTTP POST recv | Device listener → API latency |
| `api_latency` | ms | POST recv → response sent | Request processing (validation + DB) |
| `validation_latency` | ms | POST recv → signature verified | Signature check + timestamp validation |
| `db_latency` | ms | validation done → INSERT returns | PostgreSQL transaction |

### 1.2 Throughput

| Metric | Unit | Measurement |
|--------|------|-------------|
| `frames_per_sec` (FPS) | 1/s | Entropy records inserted per second |
| `requests_per_sec` (RPS) | 1/s | API requests processed per second |
| `bytes_per_sec` | bytes/s | Data written to DB per second |
| `avg_payload_size` | bytes | Average entropy payload size |

### 1.3 Cryptographic Overhead

| Metric | Unit | Computation |
|--------|------|-------------|
| `aes_ops_per_sec` | 1/s | Number of AES encryptions per second |
| `sha256_ops_per_sec` | 1/s | Number of SHA-256 hashes per second |
| `ecdsa_ops_per_sec` | 1/s | Number of ECDSA signatures per second |
| `aes_percent_of_total` | % | (encrypt_latency / total_latency) × 100 |
| `hash_percent_of_total` | % | (hash_latency / total_latency) × 100 |

### 1.4 Network Performance

| Metric | Unit | Measurement |
|--------|------|-------------|
| `network_latency_p50` | ms | Median network latency |
| `network_latency_p95` | ms | 95th percentile latency |
| `network_latency_p99` | ms | 99th percentile latency |
| `packet_loss_rate` | % | Failed deliveries / total attempts |
| `retry_count` | count | HTTP retries per request |
| `connection_errors` | count | Total TCP/serial connection failures |

### 1.5 Data Integrity

| Metric | Unit | Measurement |
|--------|------|-------------|
| `signature_verify_success_rate` | % | (verified / attempted) × 100 |
| `replay_detections` | count | Duplicate (device_id, timestamp, hash) tuples rejected |
| `timestamp_stale_rejections` | count | Requests with \|timestamp - now\| > 60s |
| `data_corruption_rate` | % | Failed deserialization / total payloads |

### 1.6 Power Consumption (Simulated)

| Metric | Unit | Source |
|--------|------|--------|
| `aes_current_ma` | mA | Firmware log (UART) |
| `hash_current_ma` | mA | Firmware log (UART) |
| `sign_current_ma` | mA | Firmware log (UART) |
| `total_energy_mj` | mJ | Integral of current × time |

### 1.7 Storage Growth

| Metric | Unit | Calculation |
|--------|------|-------------|
| `table_size_bytes` | bytes | DB SELECT pg_total_relation_size('entropy_records') |
| `records_count` | count | SELECT COUNT(*) FROM entropy_records |
| `avg_record_size` | bytes | table_size_bytes / records_count |
| `growth_rate_per_hour` | bytes/hr | (size(t+1hr) - size(t)) / 3600 |

---

## 2. Log Format (JSON Schema)

### 2.1 Firmware Timing Log

**Source**: UART output from firmware (ESP-IDF logs)

**Format**:
```json
{
  "event": "timing_checkpoint",
  "stage": "capture|encrypt|hash|sign|serialize",
  "timestamp_ms": 1746449019123,
  "start_ms": 1746449019100,
  "end_ms": 1746449019123,
  "duration_ms": 23,
  "payload_size": 64,
  "encrypted_size": 80,
  "current_ma": 125,
  "temperature_c": 28.5,
  "device_id": "esp32-001"
}
```

### 2.2 Backend Timing Log

**Source**: Backend express middleware (injected into entropyService.js)

**Format**:
```json
{
  "event": "entropy_request",
  "request_id": "uuid-1234",
  "device_id": "esp32-001",
  "timestamp": 1746449019,
  "arrival_time_ms": 1746449019500,
  "validation_start_ms": 1746449019500,
  "signature_verify_start_ms": 1746449019501,
  "signature_verify_end_ms": 1746449019512,
  "db_insert_start_ms": 1746449019512,
  "db_insert_end_ms": 1746449019528,
  "response_send_ms": 1746449019530,
  "validation_latency_ms": 28,
  "signature_latency_ms": 11,
  "db_latency_ms": 16,
  "total_api_latency_ms": 30,
  "status": "success|invalid_signature|replay_detected|timestamp_stale|internal_error",
  "error_code": null
}
```

### 2.3 Network Timing Log

**Source**: Device listener (tools/device_listener/listener.py)

**Format**:
```json
{
  "event": "network_request",
  "device_id": "esp32-001",
  "uart_tx_time_ms": 1746449019200,
  "uart_rx_time_ms": 1746449019300,
  "uart_latency_ms": 100,
  "http_post_time_ms": 1746449019300,
  "http_response_time_ms": 1746449019530,
  "http_latency_ms": 230,
  "http_status": 201,
  "retries": 0,
  "failure_reason": null
}
```

### 2.4 Sample Data Point (Complete)

```json
{
  "run_id": "run-001",
  "device_id": "esp32-001",
  "sequence": 1,
  "firmware": {
    "capture_ms": 5,
    "encrypt_ms": 23,
    "hash_ms": 8,
    "sign_ms": 0,
    "serialize_ms": 2,
    "total_ms": 38,
    "payload_bytes": 64,
    "encrypted_bytes": 80,
    "current_ma": 125,
    "temperature_c": 28.5
  },
  "network": {
    "uart_latency_ms": 100,
    "http_latency_ms": 230,
    "retries": 0,
    "packet_loss": false
  },
  "backend": {
    "validation_ms": 5,
    "signature_verify_ms": 11,
    "db_insert_ms": 16,
    "total_ms": 32,
    "status": "success",
    "error_code": null
  },
  "end_to_end_ms": 400,
  "timestamp": 1746449019
}
```

---

## 3. Data Collection Points

### 3.1 Firmware Instrumentation

**Files to modify**:
- `firmware/main/crypto.c` — Add timing around `enigma_aes_encrypt()`, `compute_integrity_hash()`
- `firmware/main/main.c` — Add timing around full pipeline

**Example instrumentation** (pseudo-code):
```c
uint32_t start_ms = esp_timer_get_time() / 1000;
enigma_aes_encrypt(payload_bytes, payload_len, encrypted_bytes, ...);
uint32_t end_ms = esp_timer_get_time() / 1000;
uint32_t duration = end_ms - start_ms;

ESP_LOGI(TAG, "{\"event\":\"encrypt\",\"duration_ms\":%u,\"payload_size\":%u}", 
         duration, payload_len);
```

### 3.2 Backend Instrumentation

**Files to modify**:
- `backend/src/services/entropyService.js` — Wrap `processEntropy()` with timing
- `backend/src/controllers/data.js` — Wrap validation steps

**Example instrumentation** (pseudo-code):
```javascript
const startTime = Date.now();
const startValidation = Date.now();

// ... validation logic ...

const endValidation = Date.now();
const startDbInsert = Date.now();

await pool.query(...);  // INSERT

const endDbInsert = Date.now();
const endTime = Date.now();

metrics.log({
  event: 'entropy_request',
  validation_ms: endValidation - startValidation,
  db_insert_ms: endDbInsert - startDbInsert,
  total_ms: endTime - startTime,
  status: 'success'
});
```

### 3.3 Device Listener Instrumentation

**File**: `tools/device_listener/listener.py`
- Timestamp when data is received from UART
- Timestamp when HTTP response is received
- Calculate latency

---

## 4. Output Files

```
/metrics/
├── docs/
│   ├── README.md                       (this file)
│   ├── log-schema.md                  (JSON log format spec)
│   └── performance-guide.md           (GOOD vs BAD, bottleneck guide)
├── python/
│   ├── collector.py                   (Parse firmware + backend logs)
│   ├── sample_generator.py            (Generate 100-500 runs)
│   ├── graphs.py                      (matplotlib visualizations)
│   ├── analyzer.py                    (Performance analysis)
│   └── requirements.txt               (matplotlib, numpy)
├── data/
│   ├── sample_metrics.json            (Pre-generated sample data)
│   ├── firmware_logs.txt              (Raw UART output)
│   └── backend_logs.jsonl             (Backend timing records)
└── graphs/
    ├── latency_breakdown.png
    ├── throughput.png
    ├── crypto_overhead.png
    ├── network_reliability.png
    ├── power_consumption.png
    └── storage_growth.png
```

---

## 5. How to Use

### Step 1: Install dependencies
```bash
cd metrics/python
pip install -r requirements.txt
```

### Step 2: Generate sample data
```bash
python sample_generator.py --runs 200 --output ../data/sample_metrics.json
```

### Step 3: Collect real data
```bash
# Terminal 1: Run firmware simulator + backend
docker compose up

# Terminal 2: Run device listener
python tools/device_listener/listener.py

# Terminal 3: Run collector
python metrics/python/collector.py --duration 5 --output ../data/real_metrics.json
```

### Step 4: Generate graphs
```bash
python graphs.py --input ../data/real_metrics.json --output ../graphs/
```

### Step 5: Analyze bottlenecks
```bash
python analyzer.py --input ../data/real_metrics.json --report ../docs/analysis_report.md
```

---

## 6. Dashboard Metrics (Real-Time Monitoring)

Suggested metrics to display in frontend dashboard:

| Metric | Update Frequency | Display Format |
|--------|------------------|-----------------|
| Current FPS | 1 per sec | "45.2 req/s" |
| Avg latency (1min window) | 1 per sec | "142ms" |
| p95 latency | 1 per min | "284ms" |
| Success rate (1min) | 1 per min | "99.8%" |
| Network packet loss | 1 per min | "0.2%" |
| Device online count | on change | "2/3 devices" |
| TRNG state | on change | "ACTIVE / SUSPENDED" |
| DB table size | 5 per min | "2.4 MB" |
| Failed transmissions | 1 per min | "0 in last min" |
| Hash verification status | real-time | "✓ verified" or "✗ failed" |

---

## Notes

- All timestamps are wall-clock (milliseconds) from system/hardware clocks
- Measurements exclude serialization/deserialization overhead (included in "serialize" stage)
- Sample data includes realistic failure modes (retries, packet loss, timeout)
- Graphs use matplotlib only (no seaborn, no hardcoded colors)
- Raw log files (firmware, backend) should be archived for offline analysis
