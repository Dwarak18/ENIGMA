# From PostgreSQL Data to Thesis: Step-by-Step Guide

**Goal**: Extract real entropy data from PostgreSQL and generate research-grade metrics for your thesis/conference paper.

**Time Required**: 10-15 minutes  
**Difficulty**: Easy (mostly automated)

---

## Prerequisites Checklist

Before you start, verify you have:

- [ ] ENIGMA system running with PostgreSQL
- [ ] Entropy data in database (at least 100 records)
- [ ] Python 3.8+ installed
- [ ] matplotlib and numpy installed

### Verify Setup

```bash
# 1. Check PostgreSQL is running and has data
psql -h localhost -U postgres -d enigma_db \
  -c "SELECT COUNT(*) as total_records FROM entropy_records;"

# Expected output: Should show a number > 100

# 2. Check Python dependencies
python -c "import matplotlib; import numpy; print('✅ All dependencies OK')"

# If this fails:
cd metrics/python
pip install -r requirements.txt
```

---

## Step 1: Extract Raw Data from PostgreSQL

This step reads your actual entropy_records from the database.

### Command
```bash
cd metrics/python

python postgres_extractor.py \
  --host localhost \
  --user postgres \
  --password postgres \
  --dbname enigma_db \
  --output ../data/my_thesis_metrics.json
```

### What Happens
- Connects to PostgreSQL
- Reads all entropy_records
- Calculates latencies
- Estimates per-stage breakdown
- Saves to JSON file

### Expected Output
```
✅ Connected to PostgreSQL
✅ Reading entropy_records table...
✅ Found 1,247 records
✅ Calculating metrics...
✅ Saving to ../data/my_thesis_metrics.json
```

### Verify Success
```bash
# Check the file was created
ls -lh ../data/my_thesis_metrics.json

# Check it has data (should be > 10 KB)
wc -l ../data/my_thesis_metrics.json

# Expected: ~1,250 lines (one per record)
```

---

## Step 2: Generate Research-Ready Report

This step analyzes the raw data and creates your publication-ready report.

### Command
```bash
python research_metrics.py \
  --input ../data/my_thesis_metrics.json \
  --output ../data/my_thesis_report.md \
  --stats-json ../data/my_thesis_stats.json
```

### What Happens
- Reads metrics JSON
- Computes statistics (mean, median, percentiles)
- Analyzes per-device performance
- Generates reliability metrics
- Creates power/storage projections
- Writes markdown report

### Expected Output
```
✅ Loading metrics from JSON...
✅ Computing statistics...
✅ Analyzing per-device performance...
✅ Generating reliability metrics...
✅ Creating report...
✅ Report saved to ../data/my_thesis_report.md
✅ Statistics saved to ../data/my_thesis_stats.json
```

### Verify Success
```bash
# Check report was created
ls -lh ../data/my_thesis_report.md

# View the report
cat ../data/my_thesis_report.md

# Expected: ~10-20 KB with formatted tables and findings
```

### What's in the Report
```
Executive Summary
├─ Total submissions
├─ Time period
├─ Key findings

Performance Metrics Table
├─ Latency (p50, p95, p99)
├─ Mean, std dev
├─ Success rate

Device Comparison Table
├─ Per-device statistics
├─ Performance fairness

Findings & Recommendations
├─ Bottleneck analysis
├─ Performance characteristics
└─ Optimization opportunities
```

---

## Step 3: Create Professional Graphs

This step generates visualization-ready PNG files for your figures.

### Command
```bash
python graphs.py \
  --input ../data/my_thesis_metrics.json \
  --output ../graphs_thesis/
```

### What Happens
- Reads metrics JSON
- Creates 7 different graphs
- Saves as PNG files (high resolution)
- Optimizes for printing/publishing

### Expected Output
```
✅ Creating latency_breakdown.png
✅ Creating throughput_over_time.png
✅ Creating crypto_overhead.png
✅ Creating network_reliability.png
✅ Creating power_consumption.png
✅ Creating storage_growth.png
✅ Creating latency_distribution.png
```

### Verify Success
```bash
# Check all 7 graphs were created
ls -lh ../graphs_thesis/

# Expected: 7 PNG files, 50-100 KB each

# View a graph
open ../graphs_thesis/latency_distribution.png
```

### Graph Details

| Graph | What It Shows | For Thesis Section |
|-------|--------------|-------------------|
| `latency_breakdown.png` | Firmware/network/backend contribution | Performance Analysis |
| `throughput_over_time.png` | Requests per hour | Throughput Evaluation |
| `crypto_overhead.png` | Signature/encryption timing | Cryptographic Analysis |
| `network_reliability.png` | Success rate, retries | Reliability Study |
| `power_consumption.png` | Current draw per operation | Power Analysis |
| `storage_growth.png` | Database size over time | Storage Scalability |
| `latency_distribution.png` | Histogram of all latencies | Performance Distribution |

---

## Step 4: Organize Files for Your Thesis

Create a clean directory structure for your paper.

### Setup
```bash
# Create thesis directory
mkdir -p ~/thesis_metrics/ENIGMA

# Copy results
cp ../data/my_thesis_report.md ~/thesis_metrics/ENIGMA/
cp ../data/my_thesis_stats.json ~/thesis_metrics/ENIGMA/
cp ../data/my_thesis_metrics.json ~/thesis_metrics/ENIGMA/
cp -r ../graphs_thesis/ ~/thesis_metrics/ENIGMA/graphs/

# Verify
ls -la ~/thesis_metrics/ENIGMA/
```

### Final Structure
```
~/thesis_metrics/ENIGMA/
├── my_thesis_report.md              ← Your tables and findings
├── my_thesis_stats.json             ← Detailed statistics (appendix)
├── my_thesis_metrics.json           ← Raw data (supplementary)
└── graphs/
    ├── latency_breakdown.png
    ├── throughput_over_time.png
    ├── crypto_overhead.png
    ├── network_reliability.png
    ├── power_consumption.png
    ├── storage_growth.png
    └── latency_distribution.png
```

---

## Step 5: Include in Your Thesis

### Copy Tables to Your Document

Open `my_thesis_report.md` and find these sections:

```markdown
## Performance Evaluation

The system was evaluated over [TIME] with [N] submissions.

### Latency Analysis

[Copy the latency table from report.md]

### Device Performance

[Copy the device comparison table from report.md]

### Key Findings

[Copy the findings section from report.md]
```

### Example Thesis Chapter Integration

```markdown
## Chapter 4: Performance Evaluation

This chapter evaluates the ENIGMA entropy management system's 
performance across multiple dimensions.

### 4.1 Methodology

Performance data was collected from production entropy_records 
stored in PostgreSQL. The dataset contains 1,247 entropy submissions 
from 3 devices over a period of 3.75 hours.

### 4.2 Latency Analysis

We measured end-to-end latency from device timestamp to server 
storage completion.

[TABLE: Latency Percentiles]
[FIGURE 4.1: Latency Distribution (from latency_distribution.png)]
[FIGURE 4.2: Latency Breakdown (from latency_breakdown.png)]

The results show that network delays dominate (61% of total latency),
suggesting opportunities for optimization.

### 4.3 Reliability

[TABLE: Device Performance]
[FIGURE 4.3: Device Comparison]

All devices achieved > 99% success rate, demonstrating system reliability.

### 4.4 Throughput

[FIGURE 4.4: Throughput Over Time (from throughput_over_time.png)]

The system sustained an average of 0.092 requests per second.

### 4.5 Key Findings

[Copy findings section from report.md]

---

## References

[1] Metrics Dataset: See supplementary materials file 
    `my_thesis_metrics.json`
[2] Detailed Statistics: See Appendix A (`my_thesis_stats.json`)
```

### Word Count Estimate
- Tables: ~100 words (with caption)
- Per figure: ~50-100 words (explanation + caption)
- Findings section: ~200-300 words
- **Total**: ~500-800 words for full chapter

---

## Step 6: Cite Your Data

### In Your Thesis
```markdown
### Data Citation

The performance data in this evaluation section comes from the 
ENIGMA project's entropy_records database, processed through the 
metrics extraction and analysis pipeline (see appendix).

Raw dataset: metrics/data/my_thesis_metrics.json
Statistical analysis: metrics/data/my_thesis_stats.json
Code repository: https://github.com/Dwarak18/ENIGMA
```

### BibTeX Entry
```bibtex
@dataset{enigma_metrics_2026,
  author = {Your Name},
  title = {ENIGMA Entropy System: Performance Metrics Dataset},
  year = {2026},
  url = {https://github.com/Dwarak18/ENIGMA/tree/main/metrics},
  note = {Available at metrics/data/my_thesis_metrics.json},
  howpublished = {GitHub Repository}
}
```

### In Your References
```
[42] Metrics Dataset. ENIGMA Entropy Management System Performance 
     Evaluation. Available at GitHub: Dwarak18/ENIGMA/metrics. 
     Accessed: [date].
```

---

## Step 7: Final Checklist

Before submitting your thesis/paper:

### Verification
- [ ] `my_thesis_report.md` opened and readable
- [ ] All tables have proper formatting
- [ ] All graphs are 7 PNG files in graphics directory
- [ ] Graphs have clear titles and axis labels
- [ ] Report shows your actual numbers (not placeholders)
- [ ] Statistics JSON file included as supplementary

### Document Integration
- [ ] Tables copied to thesis Chapter 4 (Evaluation)
- [ ] Graphs inserted as figures with captions
- [ ] Figure numbering is sequential
- [ ] All figures are referenced in text
- [ ] Captions explain what each figure shows

### References
- [ ] Dataset cited in text
- [ ] BibTeX entry added to bibliography
- [ ] Data source documented in methodology

### Quality Check
- [ ] Report shows meaningful numbers (not all zeros)
- [ ] Graphs display actual data (not empty plots)
- [ ] Statistics vary per device (not identical)
- [ ] Latency values make sense (50-300ms range typical)
- [ ] Success rate > 95% (good system reliability)

---

## Quick Troubleshooting

### "postgres_extractor.py fails"
```bash
# Check database connection
psql -h localhost -U postgres -d enigma_db -c "SELECT COUNT(*) FROM entropy_records;"

# If it fails, check PostgreSQL is running
docker ps | grep postgres
```

### "research_metrics.py produces empty report"
```bash
# Check if metrics JSON has data
head -20 ../data/my_thesis_metrics.json

# If it's nearly empty, database had no records
python postgres_extractor.py  # Try extraction again
```

### "graphs.py fails"
```bash
# Verify matplotlib is installed
python -c "import matplotlib.pyplot; print('OK')"

# If missing:
pip install matplotlib numpy
```

### "Can't find PostgreSQL password"
```bash
# Check your .bashrc or shell config
echo $PGPASSWORD

# Or use environment variable
export PGPASSWORD=postgres
python postgres_extractor.py
```

---

## All-in-One Command

**If you just want to run everything at once:**

```bash
cd metrics/python

# Single command runs extraction, analysis, and visualization
bash generate_research_metrics.sh localhost postgres postgres enigma_db

# Wait for completion (takes ~10-30 seconds)

# Then open the report
cat ../data/research_*/research_*report.md

# Done! Everything is ready for your thesis.
```

---

## Success Indicators ✅

You'll know it worked when:

1. ✅ Three files created in `metrics/data/`:
   - `my_thesis_metrics.json` (10-100 KB)
   - `my_thesis_report.md` (5-15 KB)
   - `my_thesis_stats.json` (20-50 KB)

2. ✅ Seven PNG files in `metrics/graphs_thesis/`:
   - Each 50-150 KB
   - Each shows your actual data
   - All are readable and have titles

3. ✅ Report shows real numbers:
   - Latency values: 50-300ms range
   - Success rate: > 95%
   - Devices: Your actual device IDs
   - Time period: Your actual measurement period

4. ✅ Ready to include:
   - Tables show publication-quality formatting
   - Graphs are high-resolution and clear
   - All data is from your PostgreSQL
   - Statistics are mathematically correct

---

## Next Steps After Completion

1. **Copy tables** from `my_thesis_report.md` to your thesis
2. **Include graphs** from `graphs_thesis/` as figures
3. **Cite the data** using the BibTeX entry
4. **Reference methodology** (see step 6)
5. **Submit with confidence** - backed by real measurements!

---

## Support Documents

If you need help with any step:

- **General overview**: `METRICS_README_MASTER.md`
- **Quick reference**: `metrics/docs/QUICK_START.md`
- **Complete guide**: `metrics/docs/COMPLETE_WORKFLOW.md`
- **Sample vs real**: `metrics/docs/REAL_VS_SAMPLE_DATA.md`
- **Using in research**: `metrics/docs/USING_REAL_DATA.md`
- **What is good perf**: `metrics/docs/performance-guide.md`

---

## You're Ready!

You have everything you need to:

✅ Extract real data from PostgreSQL  
✅ Generate publication-ready analysis  
✅ Create professional visualizations  
✅ Cite your data properly  
✅ Include in your thesis/conference paper  

**Start now**: `bash generate_research_metrics.sh`

**Then continue**: Open your thesis editor and copy the tables and figures!

---

*Questions? See METRICS_README_MASTER.md for more details.*
