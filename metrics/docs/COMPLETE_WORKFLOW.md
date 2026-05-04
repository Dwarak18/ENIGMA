# ENIGMA Metrics: Complete Data Flow

## 1. System Architecture (Where Data Comes From)

```
┌──────────────────────────────────────────────────────────────────┐
│                         ENIGMA SYSTEM                             │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│   ESP32 (Real)  │  or  ┌──────────────────┐
│ or Simulator    ├──────┤ firmware/simulate.py │
└────────┬────────┘      └──────────────────┘
         │
         │ Entropy data + signature
         │ UART or HTTP POST
         │
    ┌────▼────────────────────────────────┐
    │  Backend API (Node/Express)          │
    │  POST /api/v1/entropy                │
    │  - Validate signature                │
    │  - Check timestamp                   │
    │  - Verify replay                     │
    │  - Store in database                 │
    └────┬────────────────────────────────┘
         │
    ┌────▼──────────────────────┐
    │   PostgreSQL Database      │
    │   entropy_records table    │
    │   (Raw system data)        │
    └────┬──────────────────────┘
         │
         │ ← METRICS EXTRACTION STARTS HERE
         │
    ┌────▼──────────────────────────────────────┐
    │   metrics/python/postgres_extractor.py    │
    │   Reads: entropy_records table            │
    │   Outputs: real_metrics_from_db.json      │
    └────┬──────────────────────────────────────┘
         │
    ┌────▼────────────────────────────────────┐
    │   metrics/python/research_metrics.py    │
    │   Analyzes: real_metrics_from_db.json   │
    │   Outputs:                              │
    │   - research_report.md (publication)    │
    │   - research_metrics.json (data)        │
    │   - research_analysis.json (stats)      │
    └────┬────────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────┐
    │   metrics/python/graphs.py             │
    │   Creates visualizations               │
    │   Outputs: *.png files                 │
    └──────────────────────────────────────┘
         │
         │ ← USED IN THESIS/PAPERS
         │
    ┌────▼────────────────────────────────────┐
    │   Your Research Paper/Thesis             │
    │   - Include tables from report          │
    │   - Include graphs                      │
    │   - Reference metrics JSON              │
    │   - Cite methodology                    │
    └──────────────────────────────────────────┘
```

---

## 2. Data Sources: Sample vs. Real

### SAMPLE DATA PATH (For Learning)

```
sample_generator.py
  ├─ Creates 300 realistic entropy submissions
  ├─ Simulates network delays
  ├─ Adds failure scenarios
  ├─ Saves to: metrics/data/sample_metrics.json
  │
  ├─→ graphs.py (visualize sample data)
  │   └─ Creates demo graphs
  │
  └─→ research_metrics.py (analyze sample)
      └─ Creates demo report
```

### REAL DATA PATH (For Research)

```
PostgreSQL Database (entropy_records table)
  │
  ├─→ postgres_extractor.py
  │   ├─ Connects to your running database
  │   ├─ Reads all entropy_records
  │   ├─ Calculates latencies
  │   └─ Outputs: real_metrics_from_db.json
  │
  ├─→ graphs.py (visualize real data)
  │   └─ Creates publication-ready graphs
  │
  └─→ research_metrics.py (analyze real)
      ├─ Computes statistics
      ├─ Generates insights
      └─ Creates: research_report.md + analysis JSON
```

---

## 3. Complete Workflow (Step by Step)

### WORKFLOW: Generate Research Metrics from Real Data

```
Step 1: EXTRACT
┌──────────────────────────────────────────┐
│ python postgres_extractor.py             │
│   --host localhost                       │
│   --user postgres                        │
│   --password postgres                    │
│   --dbname enigma_db                     │
│   --output data/real_metrics.json        │
│                                          │
│ Input:  PostgreSQL entropy_records       │
│ Output: real_metrics.json (10-100 KB)    │
└──────────────────────────────────────────┘
                 │
                 │ Takes the JSON, analyzes
                 │
Step 2: ANALYZE
┌──────────────────────────────────────────┐
│ python research_metrics.py               │
│   --input data/real_metrics.json         │
│   --output data/research_report.md       │
│   --stats-json data/analysis.json        │
│                                          │
│ Input:  real_metrics.json                │
│ Output: research_report.md (5-15 KB)     │
│ Output: analysis.json (20-50 KB)         │
└──────────────────────────────────────────┘
                 │
                 │ Takes the JSON, visualizes
                 │
Step 3: VISUALIZE
┌──────────────────────────────────────────┐
│ python graphs.py                         │
│   --input data/real_metrics.json         │
│   --output graphs_real/                  │
│                                          │
│ Input:  real_metrics.json                │
│ Outputs:                                 │
│ - latency_breakdown.png                  │
│ - throughput_over_time.png               │
│ - crypto_overhead.png                    │
│ - network_reliability.png                │
│ - power_consumption.png                  │
│ - storage_growth.png                     │
│ - latency_distribution.png               │
└──────────────────────────────────────────┘
                 │
                 │ You now have everything
                 │ for your paper
                 │
Step 4: PUBLISH
┌──────────────────────────────────────────┐
│ Include in thesis/paper:                 │
│ ✅ Copy tables from research_report.md   │
│ ✅ Include PNG graphs                    │
│ ✅ Reference metrics JSON                │
│ ✅ Cite data collection methodology      │
└──────────────────────────────────────────┘
```

---

## 4. What Each Tool Does

### Tool 1: `postgres_extractor.py`

```
WHY: You have real data in PostgreSQL, we need to extract it
HOW: Connects to DB, reads entropy_records, calculates metrics
WHAT: Creates JSON with all measurements
WHERE: metrics/python/postgres_extractor.py

INPUT DATABASE TABLE (entropy_records):
┌─────────┬───────────┬──────────┬─────────────┐
│ id      │ device_id │ timestamp│ created_at  │
├─────────┼───────────┼──────────┼─────────────┤
│ uuid1   │ esp32-001 │ 1746449019│ 2026-05-03│
│ uuid2   │ esp32-002 │ 1746449021│ 2026-05-03│
│ uuid3   │ esp32-001 │ 1746449025│ 2026-05-03│
└─────────┴───────────┴──────────┴─────────────┘

CALCULATION:
  latency = created_at - timestamp
  e.g., 1746449019.123 - 1746449019 = 0.123 seconds = 123 ms

OUTPUT (real_metrics_from_db.json):
[
  {
    "run_id": "real-000001",
    "device_id": "esp32-001",
    "end_to_end_ms": 195,
    "timestamp": 1746449019,
    "status": "success"
  },
  ...
]
```

### Tool 2: `research_metrics.py`

```
WHY: JSON is data, humans need insights
HOW: Analyzes JSON, computes statistics, generates report
WHAT: Markdown report + detailed statistics
WHERE: metrics/python/research_metrics.py

INPUT: real_metrics_from_db.json (from postgres_extractor)

ANALYSIS PERFORMED:
  ✓ Percentile analysis (p50, p95, p99)
  ✓ Statistical measures (mean, stdev, CV)
  ✓ Device comparison (per-device stats)
  ✓ Reliability metrics (success rate, failures)
  ✓ Throughput analysis (req/s, req/day)
  ✓ Power consumption (if available)
  ✓ Storage growth (if available)
  ✓ Correlation analysis (payload vs latency)

OUTPUT:
  1. research_report.md
     - Executive summary
     - Performance table
     - Device comparison table
     - Finding & recommendations
     - Ready to include in paper
  
  2. research_analysis.json
     - Detailed statistics
     - Per-device breakdown
     - Percentiles
     - Error analysis
```

### Tool 3: `graphs.py`

```
WHY: Humans understand pictures better than numbers
HOW: Reads JSON, plots using matplotlib
WHAT: Professional PNG graphs
WHERE: metrics/python/graphs.py

INPUT: real_metrics_from_db.json (from postgres_extractor)

GRAPHS PRODUCED:
  1. latency_breakdown.png
     - Shows firmware, network, backend components
     
  2. throughput_over_time.png
     - Shows requests per hour
     
  3. crypto_overhead.png
     - Shows signature/encryption time
     
  4. network_reliability.png
     - Shows success rate, retries
     
  5. power_consumption.png
     - Shows current/voltage per submission
     
  6. storage_growth.png
     - Shows DB growth over time
     
  7. latency_distribution.png
     - Histogram of all latencies
     
OUTPUT LOCATION:
  metrics/graphs_real/*.png
```

---

## 5. Three Real Scenarios

### Scenario A: "I just want to run it once"

```bash
cd metrics/python

# 1. Extract from PostgreSQL
python postgres_extractor.py

# 2. Create report
python research_metrics.py --input ../data/real_metrics_from_db.json

# 3. Create graphs
python graphs.py --input ../data/real_metrics_from_db.json

# Done! Check results:
# - metrics/data/real_metrics_from_db.json (input)
# - metrics/data/research_report.md (OPEN THIS)
# - metrics/graphs_real/*.png (view these)
```

### Scenario B: "I want to compare before/after optimization"

```bash
cd metrics/python

# Before optimization
python postgres_extractor.py --output ../data/before.json

# ... make code changes ...

# After optimization
python postgres_extractor.py --output ../data/after.json

# Analyze both
python research_metrics.py --input ../data/before.json --output ../data/before_report.md
python research_metrics.py --input ../data/after.json --output ../data/after_report.md

# Compare
diff -u ../data/before_report.md ../data/after_report.md
```

### Scenario C: "I'm writing a thesis and need publication-ready data"

```bash
# Day 1: Start system, let it collect data for several days
docker compose up -d
python firmware/simulate.py &
python tools/device_listener/listener.py &
# ... wait for data accumulation ...

# Day 4: Extract and analyze when you have enough data
cd metrics/python

python postgres_extractor.py \
  --host your-db-host \
  --user your-user \
  --password your-password \
  --dbname enigma_db \
  --output ../data/thesis_metrics.json

python research_metrics.py \
  --input ../data/thesis_metrics.json \
  --output ../data/thesis_report.md \
  --stats-json ../data/thesis_stats.json

python graphs.py \
  --input ../data/thesis_metrics.json \
  --output ../graphs_thesis/

# Now you have:
# ✅ research_report.md - include in thesis chapter
# ✅ thesis_metrics.json - cite as dataset
# ✅ graphs_thesis/*.png - include as figures
# ✅ thesis_stats.json - detailed stats for appendix
```

---

## 6. Key Takeaway

```
┌──────────────────────────────────────────────────────┐
│              YOUR POSTGRESQL DATABASE                │
│            (Has real entropy submission data)         │
└────────────────┬─────────────────────────────────────┘
                 │
        EXTRACT METRICS
        (postgres_extractor.py)
                 │
        ┌────────▼─────────┐
        │ Metrics JSON     │
        │ (raw data)       │
        └────────┬─────────┘
                 │
        ANALYZE & CREATE REPORT
        (research_metrics.py)
                 │
        ┌────────▼─────────────────┐
        │ research_report.md        │
        │ (publication-ready)       │
        └────────┬─────────────────┘
                 │
        CREATE VISUALIZATIONS
        (graphs.py)
                 │
        ┌────────▼──────────┐
        │ *.png graphs      │
        │ (publication-ready)
        └────────┬──────────┘
                 │
        ┌────────▼──────────────────────┐
        │ INCLUDE IN YOUR THESIS/PAPER  │
        │ ✅ Tables from report.md     │
        │ ✅ Graphs as figures         │
        │ ✅ JSON as appendix          │
        └───────────────────────────────┘
```

---

## 7. File Structure Reference

```
metrics/
├── python/
│   ├── postgres_extractor.py      # ← Reads from PostgreSQL
│   ├── research_metrics.py        # ← Creates report
│   ├── graphs.py                  # ← Creates visualizations
│   ├── generate_research_metrics.sh # ← Runs all 3 above
│   └── requirements.txt           # Dependencies
│
├── data/
│   ├── sample_metrics.json        # Generated sample data (old)
│   ├── real_metrics_from_db.json  # Real data (NEW)
│   ├── research_report.md         # Analysis report (NEW)
│   ├── research_analysis.json     # Statistics (NEW)
│   └── ...
│
├── graphs/
│   └── *.png                      # Sample graphs
│
├── graphs_real/
│   └── *.png                      # Real data graphs (NEW)
│
└── docs/
    ├── README.md
    ├── USING_REAL_DATA.md         # Original guide
    ├── REAL_VS_SAMPLE_DATA.md     # This comparison (NEW)
    └── ...
```

---

## 8. Bottom Line

| Question | Answer |
|----------|--------|
| Where do sample data come from? | `sample_generator.py` (artificial) |
| Where does real data come from? | PostgreSQL entropy_records (actual measurements) |
| Can I use real data for research? | **YES** - that's the whole point! |
| How do I extract real data? | `python postgres_extractor.py` |
| How do I analyze it? | `python research_metrics.py` |
| How do I visualize it? | `python graphs.py` |
| Is it suitable for papers? | **YES** - all outputs are publication-ready |
| Can I do both sample and real? | **YES** - all tools work with both |

---

## Ready to Use!

Your PostgreSQL has the data. Now you have the tools to extract and analyze it for your research. Start with:

```bash
cd metrics/python
python postgres_extractor.py
python research_metrics.py --input ../data/real_metrics_from_db.json
python graphs.py --input ../data/real_metrics_from_db.json
```

Then open `metrics/data/research_report.md` and you're ready to include in your thesis!

