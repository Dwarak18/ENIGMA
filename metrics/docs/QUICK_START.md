# Quick Reference: Real Data Metrics

## 🚀 Get Started in 60 Seconds

### Prerequisites
- PostgreSQL running with ENIGMA data
- Python 3.8+ with matplotlib, numpy

### The One Command
```bash
cd metrics/python
bash generate_research_metrics.sh localhost postgres postgres enigma_db
```

**What it does:**
1. Extracts real data from PostgreSQL
2. Generates publication-ready report
3. Creates graphs
4. Organizes everything by timestamp

**Output locations:**
- `metrics/data/research_YYYYMMDD_HHMMSS_*.json` — Raw metrics
- `metrics/data/research_YYYYMMDD_HHMMSS_report.md` — **READ THIS** ✅
- `metrics/graphs_YYYYMMDD_HHMMSS/` — PNG graphs

---

## 📊 Metrics Included in Report

Your `research_report.md` will contain:

### 1. Performance Summary
```
Total Submissions: 1,247
Time Period: 3.75 hours
Success Rate: 99.2%
```

### 2. Latency Analysis (the main metric)
```
Metric           Value    Status
─────────────────────────────────
Median (p50)     192 ms   ✅ Good
95th %ile (p95)  485 ms   ⚠️  Fair
99th %ile (p99)  612 ms   ⚠️  High
Mean             208 ms
Std Dev          156 ms
```

### 3. Device Comparison
```
Device      Submissions  Success  Median
────────────────────────────────────────
esp32-001   287          99.7%    185 ms
esp32-002   301          99.3%    198 ms
esp32-003   659          99.1%    205 ms
```

### 4. Stage Breakdown (where time goes)
```
Stage        Avg Time  % of Total
─────────────────────────────────
Firmware     38 ms     18.3%
Network      127 ms    61.1%
Backend      32 ms     15.4%
Other        11 ms     5.2%
─────────────────────────────────
Total        208 ms    100%
```

### 5. Throughput
```
Requests/Second:  0.092
Requests/Hour:    331
Requests/Day:     7,944
```

### 6. Reliability
```
Total Requests:   1,247
Successful:       1,237 (99.2%)
Failed:           10 (0.8%)
Retries:          3
```

### 7. Key Findings & Recommendations
- Network is the bottleneck (61% of latency)
- System is highly reliable (99.2% success)
- Performance is consistent (low standard deviation)
- Can scale to 7,944+ requests per day
- Recommendations for optimization

---

## 🎓 Use in Your Thesis

### Copy Tables to Your Paper
```markdown
## Performance Evaluation

We evaluated the ENIGMA system's entropy submission pipeline 
over a period of 3.75 hours with 1,247 submissions from 
3 devices.

[TABLE FROM research_report.md]

The results show strong reliability and consistent performance...
```

### Include Graphs
```markdown
## Performance Metrics

Figure X: End-to-End Latency Distribution
[INSERT: metrics/graphs_YYYYMMDD_HHMMSS/latency_distribution.png]

Figure X+1: Throughput Over Time
[INSERT: metrics/graphs_YYYYMMDD_HHMMSS/throughput_over_time.png]

Figure X+2: Latency Breakdown
[INSERT: metrics/graphs_YYYYMMDD_HHMMSS/latency_breakdown.png]
```

### Cite Your Measurements
```bibtex
@dataset{enigma_metrics_2026,
  author = {Your Name},
  title = {ENIGMA Entropy Management System: Performance Metrics},
  year = {2026},
  url = {<your-repo-url>},
  note = {Available at metrics/data/research_metrics.json}
}
```

### Add to Methodology
```markdown
### Performance Measurement Methodology

Performance data was collected from production entropy_records 
stored in PostgreSQL. Metrics were extracted using the automated 
metrics collection tool (postgres_extractor.py), which:

1. Reads all entropy_records from the database
2. Calculates end-to-end latency as (server_created_at - device_timestamp)
3. Estimates per-stage breakdown based on typical component latencies:
   - Firmware: 50 ms (crypto operations)
   - Network: remaining latency after firmware/backend
   - Backend: 30 ms (validation + DB insert)
4. Computes statistics (percentiles, mean, stdev)
5. Generates publication-ready report

This methodology provides reproducible, auditable results
based on actual system measurements.
```

---

## 🔄 Common Workflows

### I. First-Time Setup
```bash
# Step 1: Verify PostgreSQL has data
psql -h localhost -U postgres -d enigma_db \
  -c "SELECT COUNT(*) FROM entropy_records;"

# Step 2: Generate metrics (all steps in one command)
cd metrics/python
bash generate_research_metrics.sh

# Step 3: View report
cat ../data/research_*/research_*report.md
```

### II. Weekly Measurements (for thesis/journal)
```bash
cd metrics/python

# Run extraction and analysis
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
python postgres_extractor.py \
  --output ../data/weekly_${TIMESTAMP}_metrics.json
python research_metrics.py \
  --input ../data/weekly_${TIMESTAMP}_metrics.json \
  --output ../data/weekly_${TIMESTAMP}_report.md

# Archive for later
mkdir -p ../archives/weekly_${TIMESTAMP}
mv ../data/weekly_* ../archives/weekly_${TIMESTAMP}/
```

### III. Before/After Comparison
```bash
# Before optimization
python postgres_extractor.py --output ../data/before.json
python research_metrics.py --input ../data/before.json --output ../data/before_report.md

# ... Make code changes ...

# After optimization
python postgres_extractor.py --output ../data/after.json
python research_metrics.py --input ../data/after.json --output ../data/after_report.md

# Compare results
echo "=== BEFORE ===" && grep "Median\|Mean\|p99" ../data/before_report.md
echo "=== AFTER ===" && grep "Median\|Mean\|p99" ../data/after_report.md
```

### IV. Export for Conference Paper
```bash
# Generate with descriptive names
cd metrics/python
python postgres_extractor.py --output ../data/conference_paper_metrics.json
python research_metrics.py \
  --input ../data/conference_paper_metrics.json \
  --output ../data/conference_paper_analysis.md \
  --stats-json ../data/conference_paper_stats.json
python graphs.py --input ../data/conference_paper_metrics.json --output ../graphs_conference/

# Create submission directory
mkdir -p ../submissions/conference_paper_2026/
cp ../data/conference_paper_analysis.md ../submissions/conference_paper_2026/metrics.md
cp ../graphs_conference/*.png ../submissions/conference_paper_2026/
cp ../data/conference_paper_stats.json ../submissions/conference_paper_2026/
```

---

## 📋 What You Get

### File: `research_report.md`
- ✅ Suitable for direct inclusion in thesis
- ✅ Tables formatted for papers
- ✅ Key findings and recommendations
- ✅ Ready for peer review
- Size: 5-15 KB

### File: `research_metrics.json`
- ✅ Raw data for appendix
- ✅ Every submission's metrics
- ✅ Device-by-device breakdown
- ✅ Timestamps for reproducibility
- Size: 10-100 KB (depends on data volume)

### Directory: `graphs_*/`
- ✅ 7 publication-ready PNG graphs
- ✅ High resolution for print
- ✅ Suitable for journals
- ✅ Colors and fonts optimized
- Size: 50-100 KB per graph

---

## ❓ FAQ

**Q: Can I use the sample data for my thesis?**  
A: No, sample data is artificial. Use real data from PostgreSQL.

**Q: How much data do I need?**  
A: Minimum 100 submissions for meaningful statistics. 1000+ for publication quality.

**Q: How long does extraction take?**  
A: 1-5 seconds for 1000 submissions, 10-30 seconds for 10,000+.

**Q: Can I run it multiple times?**  
A: Yes! Each run creates new timestamped files, so nothing overwrites.

**Q: What if PostgreSQL has no data?**  
A: Run the system first: `docker compose up -d`, then let it collect data for a while.

**Q: Can I compare multiple datasets?**  
A: Yes! Extract each to separate JSON files, analyze independently, then compare reports.

**Q: What statistics are included?**  
A: Mean, median, std dev, all percentiles (p10-p99.9), min, max, success rate, throughput.

**Q: Are graphs customizable?**  
A: Yes! Edit `graphs.py` to change colors, sizes, labels, or add new graphs.

**Q: Can I include raw metrics in appendix?**  
A: Yes! `research_metrics.json` is designed for this purpose.

**Q: How do I cite this data?**  
A: Use the BibTeX entry provided in USING_REAL_DATA.md or include metrics.json in supplementary materials.

---

## 🎯 Minimum Viable Thesis Integration

```markdown
## 4. Performance Evaluation

The ENIGMA system's entropy submission pipeline was evaluated 
over [TIME] with [N] submissions from [M] devices.

### 4.1 Latency Analysis

[Table from research_report.md showing p50, p95, p99]

### 4.2 Reliability

Success rate: [from report]
MTBF: [from report]

### 4.3 Throughput

The system sustained [req/sec] with [% variance].

### 4.4 Per-Stage Breakdown

[Figure: latency_breakdown.png]

The network component dominates [% of total], suggesting 
potential optimization opportunities.

### 4.5 Device Comparison

[Table from research_report.md]

Performance is consistent across devices, with [< 10%] variance.

## References

[1] Metrics data available at: metrics/data/research_metrics.json
```

**Word count: ~500 words with one table + one graph = publication ready**

---

## 🚀 Next Steps

1. **Verify data exists**
   ```bash
   psql -h localhost -U postgres -d enigma_db \
     -c "SELECT COUNT(*) FROM entropy_records;"
   ```

2. **Run metrics generation**
   ```bash
   cd metrics/python
   bash generate_research_metrics.sh
   ```

3. **Open report**
   ```bash
   cat ../data/research_*report.md
   ```

4. **Include in thesis**
   - Copy tables to your document
   - Add graphs as figures
   - Cite the metrics JSON

5. **Done!** ✅

---

## Need Help?

- **Data extraction issues?** → See `metrics/docs/USING_REAL_DATA.md`
- **Understanding the flow?** → See `docs/END_TO_END_FLOW.md`
- **Setting up locally?** → See `docs/LOCAL_SETUP_GUIDE.md`
- **Understanding metrics?** → See `metrics/docs/README.md`
- **All comparisons?** → See `metrics/docs/REAL_VS_SAMPLE_DATA.md`
- **Complete guide?** → See `metrics/docs/COMPLETE_WORKFLOW.md` (this file)

