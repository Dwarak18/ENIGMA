#!/bin/bash
# IoT Pipeline Metrics: Clean Workflow
# Generates metrics images + markdown report for thesis

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  IoT PIPELINE: THESIS METRICS GENERATION                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
DB_HOST=${1:-localhost}
DB_USER=${2:-postgres}
DB_PASSWORD=${3:-postgres}
DB_NAME=${4:-enigma_db}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "📋 Configuration:"
echo "  PostgreSQL Host: $DB_HOST"
echo "  Database: $DB_NAME"
echo "  Timestamp: $TIMESTAMP"
echo ""

# Create output directories
mkdir -p ../data
mkdir -p ../graphs_iot_${TIMESTAMP}

# Step 0: Check dependencies
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 0: Checking dependencies..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 -c "import psycopg2" 2>/dev/null || {
  echo "Installing psycopg2..."
  pip install psycopg2-binary --quiet
}

python3 -c "import matplotlib" 2>/dev/null || {
  echo "Installing matplotlib..."
  pip install matplotlib --quiet
}

python3 -c "import numpy" 2>/dev/null || {
  echo "Installing numpy..."
  pip install numpy --quiet
}

echo "✓ Dependencies ready"
echo ""

# Step 1: Collect metrics from PostgreSQL
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1/2: Collecting metrics from PostgreSQL..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 iot_metrics_generator.py \
  --host "$DB_HOST" \
  --user "$DB_USER" \
  --password "$DB_PASSWORD" \
  --dbname "$DB_NAME" \
  --output-metrics "../data/iot_metrics_${TIMESTAMP}.json" \
  --output-graphs "../graphs_iot_${TIMESTAMP}/"

METRICS_FILE="../data/iot_metrics_${TIMESTAMP}.json"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2/2: Generating markdown report with image references..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 iot_report_generator.py \
  --input "$METRICS_FILE" \
  --output "../data/iot_pipeline_report_${TIMESTAMP}.md"

REPORT_FILE="../data/iot_pipeline_report_${TIMESTAMP}.md"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         ✅ METRICS GENERATION COMPLETE                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "📊 Generated Files:"
echo "  Metrics JSON:  $METRICS_FILE"
echo "  Report MD:     $REPORT_FILE"
echo "  Graphs Dir:    ../graphs_iot_${TIMESTAMP}/"
echo ""

echo "📈 Generated Graphs:"
ls -1 "../graphs_iot_${TIMESTAMP}/" 2>/dev/null | sed 's/^/  • /' || echo "  (check graphs directory)"
echo ""

echo "📖 For Your Thesis:"
echo "  1. Review metrics report:"
echo "     cat $REPORT_FILE"
echo ""
echo "  2. Copy report to your thesis directory:"
echo "     cp $REPORT_FILE ~/thesis/chapter4_metrics.md"
echo ""
echo "  3. Copy graphs to your thesis figures directory:"
echo "     cp ../graphs_iot_${TIMESTAMP}/* ~/thesis/figures/"
echo ""
echo "  4. Markdown already references images as:"
echo "     ![Figure X](../graphs_iot_${TIMESTAMP}/image.png)"
echo ""
echo "  5. Update image paths in markdown to match your thesis structure"
echo ""

echo "✨ All metrics are publication-ready!"
echo "═══════════════════════════════════════════════════════════════"
