You are acting as a systems performance engineer and security analyst.

I am building a secure IoT pipeline with the following flow:

Camera Capture → Frame Compression → Convert to Bytes → SHA-256 Hash → AES-128 Encryption → Hardware Signing (ESP32 + ATECC608A using TRNG + Private Key) → Timestamp using DS3231 RTC → Send to Backend → Store in Database

I need REAL performance metrics, not theoretical explanations.

Your task is to:

1. DEFINE METRICS
List all measurable metrics required to evaluate this system. Must include:
- End-to-end latency (total + per stage)
- Throughput (frames/sec, requests/sec)
- Cryptographic overhead (hash, AES, signing time)
- Network performance (latency, packet loss, retries)
- Data integrity (tamper detection rate)
- Power consumption (ESP32 during each stage)
- Storage growth rate (backend database size over time)

2. DATA COLLECTION DESIGN
Explain EXACTLY how to measure each metric:
- What timestamps to log
- Where to insert logging (Python side, ESP32 firmware, backend)
- Example log format (JSON preferred)

3. IMPLEMENTATION CODE
Provide working code for:
A. Python (camera side):
   - Measure time for each stage
   - Generate logs
   - Save to CSV/JSON

B. ESP32 (ESP-IDF):
   - Measure AES/signing time
   - Print timing via UART logs

C. Backend (Node.js or Python):
   - Log request arrival time
   - Measure DB write time

4. SAMPLE DATASET
Generate realistic sample data for:
- 100–500 pipeline runs
- Include variation (network delay, failures)

5. GRAPH GENERATION
Provide Python (matplotlib only) code to generate:

- Latency breakdown graph (bar + line)
- Throughput over time
- Crypto overhead comparison
- Network reliability (% success vs failure)
- Power consumption per operation
- Storage growth over time

DO NOT use seaborn. DO NOT hardcode colors.

6. ANALYSIS
Explain:
- What is considered GOOD vs BAD performance
- Bottleneck identification logic
- Example interpretation of graphs

7. DASHBOARD METRICS (IMPORTANT)
Suggest real-time metrics to display in a monitoring dashboard:
- Live latency
- Current FPS
- Failed transmissions
- Hash verification status
- Device health

Avoid generic explanations.
Focus on measurable engineering output, logging structure, and reproducible results.