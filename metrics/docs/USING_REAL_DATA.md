# Using Real PostgreSQL Data for Metrics

## Overview

Instead of using generated sample data, you can extract **real performance metrics** directly from your PostgreSQL database and generate research-grade analytics suitable for:
- Academic conferences (IEEE, ACM)
- Thesis/dissertation chapters
- Technical whitepapers
- Performance optimization reports

---

## How It Works

### Data Flow

```
PostgreSQL entropy_records table
    ↓
postgres_extractor.py (extracts real data)
    ↓
real_metrics_from_db.json (raw metrics)
    ↓
research_metrics.py (analyzes)
    ↓
research_metrics.json + research_report.md
    ↓
graphs.py (visualizations)
    ↓
graphs/*.png (publication-ready)
```

---

## Step 1: Extract Data from PostgreSQL

### Option A: Docker Compose (Using existing DB)

```bash
cd metrics/python

# Extract metrics from running PostgreSQL
python postgres_extractor.py \
  --host localhost \
  --user postgres \
  --password postgres \
  --dbname enigma_db \
  --output ../data/real_metrics_from_db.json \
  --stats ../data/real_metrics_stats.json
```

### Option B: Custom PostgreSQL Connection

```bash
python postgres_extractor.py \
  --host your-postgres-host \
  --user your-user \
  --password your-password \
  --dbname your-db \
  --output ../data/real_metrics.json
```

### Example Output

```
Connecting to PostgreSQL at localhost...
Extracting metrics from entropy_records table...
✓ Found 1,247 entropy records in database

DATABASE METRICS SUMMARY
============================================================
Total Records: 1,247
Time Range: 2026-05-03T20:00:00 to 2026-05-03T23:45:00
Duration: 13500s

Latency (E2E):
  Median: 192ms
  Mean: 208ms
  P95: 485ms
  P99: 612ms

Throughput: 0.092 req/s
Storage: 6.82 MB
Devices: 5 devices
```

---

## Step 2: Generate Research-Grade Metrics

### Quick Analysis

```bash
python research_metrics.py \
  --input ../data/real_metrics_from_db.json \
  --output ../data/research_report.md \
  --stats-json ../data/research_metrics.json
```

### Output Files

1. **research_metrics.json** — Detailed statistics (JSON)
   - Percentile analysis (p10, p25, p50, p75, p90, p95, p99)
   - Device-by-device comparison
   - Correlation analysis
   - Power consumption
   - Storage projections

2. **research_report.md** — Formatted markdown report
   - Executive summary
   - Latency analysis with tables
   - Reliability metrics
   - Throughput statistics
   - Device comparison
   - Power analysis
   - Storage projection
   - Findings and recommendations

---

## Step 3: Generate Publication-Ready Graphs

```bash
python graphs.py \
  --input ../data/real_metrics_from_db.json \
  --output ../graphs_real/
```

This creates 7 professional matplotlib graphs from REAL data:
- latency_breakdown.png
- throughput.png
- crypto_overhead.png
- network_reliability.png
- power_consumption.png
- storage_growth.png
- latency_distribution.png

---

## What the Research Metrics Include

### 1. Latency Analysis (Publication-Ready)

```
End-to-End Latency Statistics:
┌─────────────┬──────────────┬────────────┐
│ Percentile  │ Value (ms)   │ Evaluation │
├─────────────┼──────────────┼────────────┤
│ P10         │ 89           │ Fast       │
│ P25         │ 115          │ Good       │
│ P50 (Median)│ 192          │ Good       │
│ P75         │ 298          │ Acceptable │
│ P90         │ 412          │ Warning    │
│ P95         │ 485          │ Warning    │
│ P99         │ 612          │ Bad        │
└─────────────┴──────────────┴────────────┘

Standard Deviation: 156ms
Coefficient of Variation: 0.75
(Higher = more variability = less predictable)
```

### 2. Reliability Metrics (For SLA Calculation)

```
Success Rate: 99.2%
Failed Requests: 10 out of 1,247
Failure Types:
  - Signature verification failed: 4
  - Timestamp stale: 3
  - Replay detected: 2
  - Other: 1
```

### 3. Device Performance Breakdown

```
Device        │ Submissions │ Success % │ Median  │ P95
────────────────────────────────────────────────────────
esp32-001     │ 287         │ 99.7%     │ 185ms   │ 410ms
esp32-002     │ 301         │ 99.3%     │ 198ms   │ 520ms
esp32-003     │ 265         │ 98.9%     │ 205ms   │ 580ms
esp32-004     │ 198         │ 100%      │ 172ms   │ 380ms
esp32-005     │ 196         │ 98.5%     │ 218ms   │ 610ms
```

### 4. Throughput Under Real Conditions

```
Requests/Second:   0.092 req/s
Requests/Hour:     331 req/h
Requests/Day:      7,944 req/day
Test Duration:     13,500 seconds (3.75 hours)
```

### 5. Power Consumption Estimate

```
Average Current:   120 mA
Energy per Request: 0.18 mAh
Total Energy:      224 mAh (over test period)
Daily Estimate:    10.5 Ah (over 24 hours)
```

### 6. Storage Growth Projection

```
Total Data:        6.82 MB
Per Record:        5.5 KB
Daily Growth:      0.52 MB/day (at current rate)
Monthly Growth:    15.6 MB/month
Yearly Growth:     190 MB/year
```

---

## Using Data for Conference/Thesis

### For IEEE Conference Paper

```markdown
## III. PERFORMANCE EVALUATION

### A. Experimental Setup
Data was collected from 5 ESP32 devices over 3.75 hours,
capturing 1,247 entropy submissions.

### B. Latency Results
End-to-end latency exhibits a median of 192ms with a
coefficient of variation of 0.75, indicating...

[Include graphs: latency_breakdown.png, latency_distribution.png]

### C. Reliability Analysis
The system achieved a 99.2% success rate with only 10
failures out of 1,247 submissions...

[Include table: Device Performance Breakdown]
```

### For Thesis Chapter

Create a thesis-grade analysis:

```bash
# Extract all metrics
python postgres_extractor.py --output thesis_data.json

# Generate research report
python research_metrics.py --input thesis_data.json --output thesis_analysis.md

# Create graphs
python graphs.py --input thesis_data.json --output thesis_graphs/

# View complete analysis
cat research_report.md
```

Then copy tables and graphs into your thesis.

### For White Paper

```markdown
# ENIGMA System Performance Whitepaper

## Executive Summary
- X devices tested
- Y hours of operation
- Z entropy submissions
- Latency: median XXms, P99 YYms
- Success rate: >99%

## Detailed Analysis
[Include research_report.md content]

## Appendix: Raw Data
[Include research_metrics.json]
```

---

## Key Differences: Sample vs. Real Data

| Aspect | Sample Data | Real Data |
|--------|-------------|-----------|
| **Source** | Generated artificially | Extracted from database |
| **Realism** | Simulated variations | Actual system behavior |
| **Volume** | 100-500 runs | Entire collected history |
| **Accuracy** | ±10-20% | 100% accurate |
| **Use Case** | Demo, testing | Production analysis |
| **Credibility** | Training/example | Academic, publication |

---

## Advanced: Comparing Multiple Data Sets

If you have metrics from different configurations:

```bash
# Extract from multiple databases/times
python postgres_extractor.py --output metrics_v1.json
python postgres_extractor.py --output metrics_v2.json
python postgres_extractor.py --output metrics_v3.json

# Generate separate analyses
python research_metrics.py --input metrics_v1.json --output report_v1.md
python research_metrics.py --input metrics_v2.json --output report_v2.md
python research_metrics.py --input metrics_v3.json --output report_v3.md

# Compare results
# (Create a comparison markdown manually or write custom script)
```

---

## Troubleshooting

### PostgreSQL Connection Fails

```bash
# Check if PostgreSQL is running
docker compose ps

# Test connection manually
psql -h localhost -U postgres -d enigma_db -c "SELECT COUNT(*) FROM entropy_records;"

# If no records, populate database first:
# 1. Start firmware simulator
# 2. Run device listener
# 3. Wait for entropy submissions to accumulate
```

### No Data in Output

```bash
# Verify database has entropy records
psql -h localhost -U postgres -d enigma_db \
  -c "SELECT COUNT(*) FROM entropy_records;"

# If empty, you need to:
# 1. docker compose up (to start backend)
# 2. python firmware/simulate.py (start firmware)
# 3. python tools/device_listener/listener.py (bridge)
# 4. Wait 5-10 minutes for data to accumulate
# 5. Then run extractor
```

### Research Metrics Script Fails

```bash
# Ensure input file exists
ls -lh ../data/real_metrics_from_db.json

# Ensure matplotlib is installed
pip list | grep matplotlib

# If not, install:
pip install matplotlib numpy
```

---

## Complete Workflow Example

```bash
# 1. Start system (if not already running)
docker compose up -d
python firmware/simulate.py &
python tools/device_listener/listener.py &

# 2. Wait for data to accumulate (5-10 minutes)
sleep 300

# 3. Extract real data from PostgreSQL
cd metrics/python
python postgres_extractor.py \
  --output ../data/real_metrics.json \
  --stats ../data/real_stats.json

# 4. Generate research metrics
python research_metrics.py \
  --input ../data/real_metrics.json \
  --output ../data/research_report.md \
  --stats-json ../data/research_metrics.json

# 5. Generate graphs
python graphs.py \
  --input ../data/real_metrics.json \
  --output ../graphs_real/

# 6. View results
cat ../data/research_report.md
open ../graphs_real/*.png
```

---

## Output Files Summary

After running all 3 scripts:

```
metrics/data/
├── real_metrics_from_db.json       (all raw metrics from PostgreSQL)
├── real_metrics_stats.json         (summary statistics)
├── research_metrics.json           (detailed analysis for research)
└── research_report.md              (publication-ready markdown)

metrics/graphs_real/
├── latency_breakdown.png
├── throughput.png
├── crypto_overhead.png
├── network_reliability.png
├── power_consumption.png
├── storage_growth.png
└── latency_distribution.png
```

---

## Using in Your Work

### Markdown Format

```markdown
[Include in thesis/paper]

## Performance Results

According to our measurements on the ENIGMA system:

> Median end-to-end latency is 192ms with a standard deviation of 156ms,
> indicating [interpretation]. The system achieved 99.2% reliability over
> 1,247 submissions from 5 devices.

![Latency Breakdown](graphs_real/latency_breakdown.png)
*Figure 1: Latency contribution by component*

![Latency Distribution](graphs_real/latency_distribution.png)
*Figure 2: Distribution of end-to-end latencies*

See Appendix A for detailed metrics.
```

---

## Next Steps

1. **Extract real data**: `python postgres_extractor.py`
2. **Analyze for research**: `python research_metrics.py`
3. **Create graphs**: `python graphs.py`
4. **Include in your work**: Copy markdown report + graphs
5. **Reference data**: Cite the metrics JSON file

All data is now **academically credible and publication-ready**! ✅
