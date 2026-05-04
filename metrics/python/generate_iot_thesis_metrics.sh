#!/bin/bash
# IoT Pipeline Metrics: Complete Thesis Report Generation
# Collects real data from PostgreSQL and generates publication-ready metrics

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

# Step 1: Collect metrics from PostgreSQL
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1/3: Collecting metrics from PostgreSQL..."
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
echo "Step 2/3: Generating thesis-ready report..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 iot_report_generator.py \
  --input "$METRICS_FILE" \
  --output "../data/iot_pipeline_report_${TIMESTAMP}.md"

REPORT_FILE="../data/iot_pipeline_report_${TIMESTAMP}.md"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3/3: Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "✅ IoT PIPELINE METRICS GENERATION COMPLETE"
echo ""

echo "📊 Generated Files:"
echo "  Metrics JSON:  $METRICS_FILE"
echo "  Report:        $REPORT_FILE"
echo "  Graphs Dir:    ../graphs_iot_${TIMESTAMP}/"
echo ""

echo "📈 Generated Graphs:"
ls -1 "../graphs_iot_${TIMESTAMP}/" 2>/dev/null | sed 's/^/  • /' || echo "  (graphs directory will be created after first run)"
echo ""

echo "📖 Next Steps for Your Thesis:"
echo "  1. Review the report:"
echo "     cat $REPORT_FILE"
echo ""
echo "  2. Copy tables and sections to your thesis:"
echo "     - Latency Analysis → Chapter 4 (Evaluation)"
echo "     - Throughput Analysis → Chapter 4"
echo "     - Reliability Analysis → Chapter 4"
echo "     - Storage Analysis → Chapter 4"
echo ""
echo "  3. Include graphs as figures:"
echo "     - Insert ../graphs_iot_${TIMESTAMP}/*.png into your document"
echo "     - Reference them in the text with figure numbers"
echo ""
echo "  4. Add metrics as appendix:"
echo "     - Include $METRICS_FILE as Appendix A (Raw Data)"
echo "     - Include $REPORT_FILE as Appendix B (Analysis)"
echo ""

echo "🎓 All metrics are publication-ready!"
echo "   Use directly in thesis, conference papers, or research publications."
echo ""

echo "═══════════════════════════════════════════════════════════════"
