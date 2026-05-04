# ENIGMA Performance Analysis Guide

## What is GOOD vs BAD Performance?

### Latency Benchmarks

| Metric | EXCELLENT | GOOD | WARNING | BAD | CRITICAL |
|--------|-----------|------|---------|-----|----------|
| **Total E2E Latency** | <100ms | 100-200ms | 200-500ms | 500-1000ms | >1000ms |
| **Firmware (AES)** | <20ms | 20-30ms | 30-50ms | 50-100ms | >100ms |
| **Firmware (SHA-256)** | <10ms | 10-15ms | 15-25ms | 25-50ms | >50ms |
| **Signature Verify** | <10ms | 10-15ms | 15-30ms | 30-50ms | >50ms |
| **DB Insert** | <15ms | 15-30ms | 30-50ms | 50-100ms | >100ms |
| **Network** | <50ms | 50-100ms | 100-300ms | 300-1000ms | >1000ms |

### Throughput Benchmarks

| Metric | EXCELLENT | GOOD | WARNING | BAD | CRITICAL |
|--------|-----------|------|---------|-----|----------|
| **Requests/sec** | >10 | 5-10 | 2-5 | 1-2 | <1 |
| **Success Rate** | >99.9% | 99-99.9% | 95-99% | 90-95% | <90% |
| **Packet Loss** | 0% | <0.1% | 0.1-1% | 1-5% | >5% |
| **Replay Detection Rate** | 0% | <0.01% | 0.01-0.1% | 0.1-1% | >1% |

### Power Consumption

| Stage | Target | Acceptable | Concerning |
|-------|--------|-----------|-------------|
| AES Encrypt | 100-120 mA | 120-150 mA | >150 mA |
| SHA-256 Hash | 80-100 mA | 100-120 mA | >120 mA |
| ECDSA Sign | 90-110 mA | 110-140 mA | >140 mA |
| Idle | <20 mA | 20-40 mA | >40 mA |

### Storage Growth

| Rate | Status | Action |
|------|--------|--------|
| <1 MB/hour | HEALTHY | Continue monitoring |
| 1-5 MB/hour | NORMAL | Expected for sustained load |
| 5-10 MB/hour | WATCH | Plan archival/partitioning |
| >10 MB/hour | CRITICAL | Implement immediate cleanup |

---

## Bottleneck Identification Guide

### Step 1: Calculate Percentage Breakdown

For each run, calculate:
```
firmware_pct = firmware_total_ms / e2e_total_ms × 100
network_pct = network_latency_ms / e2e_total_ms × 100
backend_pct = backend_total_ms / e2e_total_ms × 100
```

### Step 2: Find the Biggest Contributor

| Largest Stage | Diagnosis | Action |
|---------------|-----------|--------|
| **Firmware > 50%** | Encryption/hashing is slow | Check ESP32 clock speed (160/240 MHz), CPU load, or crypto library |
| **Network > 40%** | WiFi/serial connection is slow | Check WiFi signal, baud rate, or network congestion |
| **Backend > 40%** | Server validation or DB is slow | Check signature verify performance, DB indexes, or query time |
| **All balanced** | System is well-tuned | Focus on P95/P99 latencies for outliers |

### Step 3: Deep Dive by Stage

#### If Firmware is Bottleneck (> 150ms)

Look at:
- `encrypt_ms`: If > 50ms → AES is slow
  - Check if using hardware accelerator (if available)
  - Profile actual CPU usage during encryption
  - Consider pipelining (start next capture while encrypting)
  
- `hash_ms`: If > 30ms → SHA-256 is slow
  - Check ESP32 CPU frequency
  - Consider incremental hashing or batching
  
- `sign_ms`: If > 50ms → ECDSA is slow (rare on ESP32)
  - May not be implemented yet; check firmware source
  - If implemented, consider using hardware ATECC608A chip

#### If Network is Bottleneck (> 300ms)

Look at:
- `uart_latency_ms`: If > 100ms → Serial connection is slow
  - Check UART baud rate (default 115200?)
  - Check USB cable quality
  - Check device listener latency
  
- `http_latency_ms`: If > 300ms → HTTP request latency is high
  - Check WiFi signal strength
  - Measure backend response time separately (subtract from http_latency)
  - Check for retries (if retry_count > 0)
  
- `retry_count > 0`: Connection is unreliable
  - Increase retry backoff
  - Check WiFi AP uptime
  - Consider using cellular backup

#### If Backend is Bottleneck (> 100ms)

Look at:
- `validation_ms`: If > 30ms → Request parsing is slow
  - Check JSON parsing performance
  - Look for blocking I/O in validation

- `signature_verify_ms`: If > 30ms → Signature verification is slow
  - Check if using Node.js built-in crypto (should be <10ms)
  - Consider pre-parsing signature format
  - Profile with `node --prof` if needed

- `db_insert_ms`: If > 50ms → Database is slow
  - Check PostgreSQL query plan: `EXPLAIN (ANALYZE) INSERT ...`
  - Check disk I/O: `iostat` on server
  - Check for lock contention: `SELECT * FROM pg_locks;`
  - Add index if needed

---

## Example Bottleneck Analysis

### Scenario 1: Total E2E = 450ms (BAD)

```
firmware: 180ms (40%)
network: 200ms (44%)
backend: 70ms (16%)
```

**Finding**: Dual bottleneck (firmware + network)

**Actions**:
1. Check firmware:
   - `encrypt_ms = 150ms` → Slow AES
   - Action: Enable hardware AES if available, or reduce payload size
   
2. Check network:
   - `uart_latency = 80ms`, `http_latency = 120ms`
   - Action: Increase UART baud rate to 921600, improve WiFi signal

**Expected improvement**: 450ms → ~250ms (44% reduction)

---

### Scenario 2: P95 Latency = 800ms (CRITICAL)

```
Median: 150ms
P95: 800ms
P99: 2000ms
```

**Finding**: Extreme tail latencies (5% of requests are very slow)

**Root causes** (check in order):
1. WiFi disconnects/reconnects → `retry_count > 0` in P95 requests
2. DB lock contention → spike every N seconds in backend logs
3. Signature verification cache miss → first request per device slower
4. Garbage collection → GC pauses in Node.js

**Actions**:
1. Add exponential backoff for retries
2. Implement signature verify result caching (device_id → key)
3. Profile Node.js: `node --trace-gc app.js`
4. Shard database by device_id if needed

---

### Scenario 3: Storage Growing at 20MB/hour (CRITICAL)

```
records/hour: 3600 (assuming 1 per sec)
avg_record_size: 5.5 KB
growth_rate: 3600 × 5.5 KB = 19.8 MB/hour
```

**Finding**: Very fast accumulation; will fill disk in ~5 days at 1TB

**Actions**:
1. Implement data retention policy (e.g., keep 7 days)
2. Archive old records to S3/cold storage hourly
3. Partition table by date for easier deletion
4. Example: `DELETE FROM entropy_records WHERE created_at < NOW() - INTERVAL '7 days'` (cron job)

---

## How to Read the Graphs

### Graph 1: Latency Breakdown (Stacked Bar)

```
Bar height = total latency (ms)
Sections = firmware, network, backend

If most of bar is blue (firmware):
  → Slow crypto ops (see firmware bottleneck guide)
  
If most of bar is orange (network):
  → Poor WiFi/serial (see network bottleneck guide)
  
If most of bar is green (backend):
  → Slow server (see backend bottleneck guide)
```

### Graph 2: Throughput Over Time (Line)

```
Y-axis = requests/sec
Dips in line = network outages or retries

If line drops to 0 and recovers:
  → Temporary WiFi disconnect
  → Action: Check WiFi stability, increase timeout

If line gradually declines:
  → Resource exhaustion (DB getting slow, server CPU maxed)
  → Action: Check server metrics (CPU, RAM, disk I/O)
```

### Graph 3: Crypto Overhead (Pie)

```
Size of slice = % of total latency

If AES > 60%:
  → Encryption dominates
  → Action: Profile AES, check hardware acceleration
  
If SHA-256 > 40%:
  → Hashing dominates (unusual)
  → Action: Check if using single-pass or multi-pass hash
  
If validation/signature > 30%:
  → Backend validation dominates
  → Action: Implement signature caching, use faster crypto library
```

### Graph 4: Network Reliability (Bar)

```
X-axis = percentile buckets (slow requests grouped together)
Bar color = success (green) / retry (yellow) / failed (red)

High red at right side (slow requests):
  → Slow requests are more likely to fail
  → Action: Increase timeout, improve network

Red scattered throughout:
  → Random failures (not correlation with latency)
  → Action: Check for network glitches, improve error recovery
```

### Graph 5: Power Consumption (Line)

```
Y-axis = current (mA)
Peaks = during crypto operations
Baseline = idle current

If peaks > 150mA:
  → Potential thermal issue or inefficient encryption
  → Action: Check ESP32 temperature, reduce clock speed
  
If baseline > 40mA:
  → High idle current (WiFi always on?)
  → Action: Consider sleep modes, WiFi power save
```

### Graph 6: Storage Growth (Line)

```
Y-axis = table size (MB)
X-axis = time (hours)
Slope = growth rate

Linear growth = consistent record insertion rate
  → Expected; monitor for capacity
  
Exponential growth = increasing record rate
  → Check if new devices added or capture frequency increased
  
Flat line = no new records
  → Normal during idle periods
```

---

## Quick Diagnosis Checklist

```
□ Collect 100+ requests under normal operation
□ Calculate: median, P95, P99, success rate
□ Check if metrics are in GOOD range (see table above)
□ If not GOOD:
  □ Identify largest bottleneck (firmware / network / backend)
  □ Follow deep-dive guide for that component
  □ Make one change at a time
  □ Re-collect data and compare
  □ Iterate until metrics are GOOD
□ Document findings in analysis_report.md
```

---

## Tools for Investigation

### Find Slow Requests
```python
import json
with open('metrics.json') as f:
    data = json.load(f)
    slow = [r for r in data if r['end_to_end_ms'] > 300]
    print(f"Slow requests: {len(slow)} / {len(data)}")
    for r in slow[:5]:
        print(f"  E2E: {r['end_to_end_ms']}ms, "
              f"FW: {r['firmware']['total_ms']}ms, "
              f"NET: {r['network']['http_latency_ms']}ms, "
              f"BE: {r['backend']['total_ms']}ms")
```

### Find Bottleneck by Stage
```python
fw_total = sum(r['firmware']['total_ms'] for r in data)
net_total = sum(r['network']['http_latency_ms'] for r in data)
be_total = sum(r['backend']['total_ms'] for r in data)
e2e_total = sum(r['end_to_end_ms'] for r in data)

print(f"Firmware: {fw_total/e2e_total*100:.1f}%")
print(f"Network:  {net_total/e2e_total*100:.1f}%")
print(f"Backend:  {be_total/e2e_total*100:.1f}%")
```

### Find High Variance in Latency
```python
import statistics
latencies = [r['end_to_end_ms'] for r in data]
print(f"Median: {statistics.median(latencies):.1f}ms")
print(f"StdDev: {statistics.stdev(latencies):.1f}ms")
print(f"CV: {statistics.stdev(latencies) / statistics.mean(latencies):.2f}")
```

---

## Optimization Tips (Quick Wins)

1. **Increase UART baud rate** (firmware): 115200 → 921600
   - Saves ~50ms per request
   - Check USB cable compatibility

2. **Cache signature verification key per device**:
   - Saves 5-10ms by avoiding key lookup
   - Already implemented in `entropyService.js`

3. **Batch database inserts** (if many parallel devices):
   - Instead of INSERT 1 at a time, INSERT N together
   - Saves 30-50% DB latency

4. **Enable PostgreSQL connection pooling**:
   - Reduce connection overhead
   - Already using pg-pool

5. **Reduce signature verification frequency**:
   - For trusted devices, verify every Nth request
   - Risk: MITM attack possible; use with caution

6. **Implement webhook callbacks** (instead of polling):
   - If firmware polls backend, switch to push model
   - Saves round-trip latency

---

## When to Accept "BAD" Performance

Some cases where slow latency is acceptable:

1. **First request from new device**: Public key lookup from DB (can be 50-100ms extra)
   - Solution: Pre-register devices to avoid latency
   
2. **High concurrent load**: Database contention (can see 2-3× slowdown)
   - Solution: Read replicas, caching layer, or load balancing

3. **Over WiFi with poor signal**: Network latency can exceed 500ms
   - Solution: Cellular backup, WiFi optimization, or local buffering

4. **Production backup/archival**: Large batch deletes cause table bloat
   - Solution: Schedule during off-peak hours, use VACUUM FULL

---

## Continuous Monitoring (Recommended)

Run metrics collection continuously and track trends:

```bash
# Every hour, collect 60 seconds of data
0 * * * * python /metrics/python/collector.py --duration 60 --output /metrics/data/hourly_$(date +\%Y\%m\%d_\%H).json
```

Then generate weekly report:
```bash
# Every Monday at 9am
0 9 * * 1 python /metrics/python/analyzer.py --days 7 --report /metrics/reports/weekly.md
```

This gives you:
- Trend detection (performance degrading over time?)
- Seasonal patterns (Friday night vs Monday morning?)
- Early warning (P95 starting to increase?)
