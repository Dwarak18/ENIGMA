# Quick Setup for IoT Metrics Generation

## Install Dependencies

```bash
pip install psycopg2-binary matplotlib numpy
```

## Run Metrics Generation

```bash
cd metrics/python

# Option 1: Using the bash script (Linux/Mac/WSL)
bash generate_iot_metrics.sh localhost postgres postgres enigma_db

# Option 2: Manual execution (if bash has issues)
python3 iot_metrics_generator.py \
  --host localhost \
  --user postgres \
  --password postgres \
  --dbname enigma_db \
  --output-metrics ../data/iot_metrics.json \
  --output-graphs ../graphs_iot/

python3 iot_report_generator_v2.py \
  --input ../data/iot_metrics.json \
  --output ../data/iot_pipeline_report.md
```

## What Gets Generated

```
metrics/
├── data/
│   ├── iot_metrics.json          (Raw metrics - for reproducibility)
│   └── iot_pipeline_report.md    (Markdown with image references)
│
└── graphs_iot/
    ├── latency_analysis.png
    ├── throughput_analysis.png
    ├── reliability_analysis.png
    ├── storage_analysis.png
    └── comprehensive_dashboard.png
```

## For Your Thesis

### Step 1: Review the markdown report
```bash
cat ../data/iot_pipeline_report.md
```

### Step 2: Copy files to thesis directory
```bash
# Copy markdown report
cp ../data/iot_pipeline_report.md ~/thesis/chapter4_metrics.md

# Copy images
cp ../graphs_iot/* ~/thesis/figures/
```

### Step 3: Update image paths in markdown
The markdown uses relative paths like `![Latency Analysis](latency_analysis.png)`

Update to match your thesis structure:
- Change to `![Latency Analysis](../figures/latency_analysis.png)`
- Or adjust based on your directory layout

### Step 4: Include in your thesis
The markdown is ready to be:
- Converted to Word (using Pandoc)
- Converted to PDF (using Pandoc)
- Copied into LaTeX
- Included in your thesis directly

## Troubleshooting

### PostgreSQL Connection Error
```bash
# Check if PostgreSQL is running and has data
psql -h localhost -U postgres -d enigma_db \
  -c "SELECT COUNT(*) FROM entropy_records;"
```

If 0 records, run your ENIGMA system first:
```bash
docker compose up -d
python firmware/simulate.py &
python tools/device_listener/listener.py &
# Wait 5+ minutes for data
```

### Missing Python Module
```bash
# Install all dependencies
pip install psycopg2-binary matplotlib numpy
```

### Bash Script Issues (Windows WSL)
Use the manual Python execution instead:
```bash
python3 iot_metrics_generator.py --host localhost --user postgres --password postgres --dbname enigma_db --output-metrics ../data/iot_metrics.json --output-graphs ../graphs_iot/
python3 iot_report_generator_v2.py --input ../data/iot_metrics.json --output ../data/iot_pipeline_report.md
```

## Example Output

### Markdown Report Structure
```markdown
# Secure IoT Pipeline: Performance Metrics Report

## Executive Summary
- Mean End-to-End Latency: 192.4 ms
- 95th Percentile Latency: 412.3 ms
- Throughput: 0.092 RPS (331.2 RPH)
- Success Rate: 99.2%
- Total Records: 1,247

## Latency Analysis

### Latency Statistics
| Metric | Value (ms) |
|--------|------------|
| Min | 45.3 |
| p50 | 185.2 |
| p95 | 412.3 |
| p99 | 487.9 |
| Max | 512.7 |
| Mean | 192.4 |
| StdDev | 98.6 |

### Per-Stage Breakdown
| Pipeline Stage | Latency (ms) | % |
|---|---|---|
| Capture | 28.8 | 15% |
| Compression | 38.5 | 20% |
| ... | ... | ... |

### Visualization
![Latency Analysis](latency_analysis.png)

## Throughput Analysis
...

## Reliability Analysis
...

## Storage Analysis
...
```

## Key Points

✅ **Complete Data**: All tables show your actual PostgreSQL data
✅ **Professional Graphics**: 5 high-resolution PNG files
✅ **Thesis-Ready Format**: Markdown with proper formatting
✅ **Image References**: All images referenced in the report
✅ **Reproducible**: JSON data for verification
✅ **Easy Integration**: Copy directly to your thesis

## Time Required

- Generate metrics: 2-3 minutes
- Review report: 2-3 minutes
- Copy to thesis: 1-2 minutes
- **Total: < 10 minutes**

Your thesis now has publication-ready performance metrics! 🎓
