#!/bin/bash
# Complete workflow to extract real data and generate research metrics
# Usage: bash generate_research_metrics.sh

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   ENIGMA Research Metrics Generation Workflow              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
DB_HOST=${1:-localhost}
DB_USER=${2:-postgres}
DB_PASSWORD=${3:-postgres}
DB_NAME=${4:-enigma_db}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "Configuration:"
echo "  PostgreSQL Host: $DB_HOST"
echo "  Database: $DB_NAME"
echo "  Timestamp: $TIMESTAMP"
echo ""

# Step 1: Extract from PostgreSQL
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1/3: Extracting data from PostgreSQL..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

python postgres_extractor.py \
  --host "$DB_HOST" \
  --user "$DB_USER" \
  --password "$DB_PASSWORD" \
  --dbname "$DB_NAME" \
  --output "../data/research_${TIMESTAMP}_metrics.json" \
  --stats "../data/research_${TIMESTAMP}_stats.json"

METRICS_FILE="../data/research_${TIMESTAMP}_metrics.json"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2/3: Generating research-grade analysis..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

python research_metrics.py \
  --input "$METRICS_FILE" \
  --output "../data/research_${TIMESTAMP}_report.md" \
  --stats-json "../data/research_${TIMESTAMP}_analysis.json"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3/3: Creating publication-ready graphs..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

python graphs.py \
  --input "$METRICS_FILE" \
  --output "../graphs_${TIMESTAMP}/"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         ✅ RESEARCH METRICS GENERATED SUCCESSFULLY         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "📊 Generated Files:"
echo "  Metrics:     ../data/research_${TIMESTAMP}_metrics.json"
echo "  Statistics:  ../data/research_${TIMESTAMP}_stats.json"
echo "  Analysis:    ../data/research_${TIMESTAMP}_analysis.json"
echo "  Report:      ../data/research_${TIMESTAMP}_report.md"
echo "  Graphs:      ../graphs_${TIMESTAMP}/"
echo ""

echo "📈 Graphs Generated:"
ls -1 "../graphs_${TIMESTAMP}/" | sed 's/^/  • /'
echo ""

echo "📖 Next Steps:"
echo "  1. Review report: cat ../data/research_${TIMESTAMP}_report.md"
echo "  2. View graphs:   open ../graphs_${TIMESTAMP}/*.png"
echo "  3. Use in paper:  Include tables and figures from report"
echo "  4. Reference data: Cite the metrics JSON file"
echo ""

echo "🎓 Ready for:"
echo "  ✓ Conference papers"
echo "  ✓ Thesis chapters"
echo "  ✓ Technical whitepapers"
echo "  ✓ Performance reports"
echo ""
