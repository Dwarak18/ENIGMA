#!/usr/bin/env python3
"""
IoT Pipeline Metrics Report Generator with Image References
Generates clean markdown with embedded image references for thesis
"""

import json
from datetime import datetime
from pathlib import Path
import argparse

class IoTMetricsReportGenerator:
    def __init__(self, metrics_file, output_file, graphs_dir=None):
        self.metrics_file = metrics_file
        self.output_file = output_file
        self.metrics = self._load_metrics()
        self.graphs_dir = graphs_dir or self._infer_graphs_dir()

    def _infer_graphs_dir(self):
        """Infer graphs directory from metrics filename"""
        metrics_path = Path(self.metrics_file)
        timestamp = metrics_path.stem.split('_')[-1]
        inferred_dir = metrics_path.parent.parent / f"graphs_iot_{timestamp}"
        return str(inferred_dir)

    def _load_metrics(self):
        """Load metrics from JSON file"""
        try:
            with open(self.metrics_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading metrics: {e}")
            return {}

    def generate_report(self):
        """Generate comprehensive metrics report"""
        report = []
        
        report.append("# Secure IoT Pipeline: Performance Metrics Report\n")
        report.append(f"**Report Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        report.append(f"**Images Directory:** {self.graphs_dir}\n\n")
        
        # Executive Summary
        report.extend(self._generate_executive_summary())
        
        # Latency Analysis
        report.extend(self._generate_latency_analysis())
        
        # Throughput Analysis
        report.extend(self._generate_throughput_analysis())
        
        # Reliability Analysis
        report.extend(self._generate_reliability_analysis())
        
        # Storage Analysis
        report.extend(self._generate_storage_analysis())
        
        # Performance Classification
        report.extend(self._generate_performance_classification())
        
        # Recommendations
        report.extend(self._generate_recommendations())
        
        # Appendix
        report.extend(self._generate_appendix())
        
        # Write report
        with open(self.output_file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(report))
        
        print(f"✓ Report generated: {self.output_file}")

    def _generate_executive_summary(self):
        """Generate executive summary"""
        sections = [
            "## Executive Summary\n",
            "This report presents comprehensive performance metrics for the Secure IoT Pipeline.\n\n"
        ]
        
        latency = self.metrics.get('latency', {}).get('end_to_end_latency_ms', {})
        throughput = self.metrics.get('throughput', {})
        reliability = self.metrics.get('reliability', {})
        
        sections.append("### Key Findings\n")
        sections.append(f"- **Mean End-to-End Latency:** {latency.get('mean', 0):.2f} ms\n")
        sections.append(f"- **95th Percentile Latency:** {latency.get('p95', 0):.2f} ms\n")
        sections.append(f"- **99th Percentile Latency:** {latency.get('p99', 0):.2f} ms\n")
        sections.append(f"- **Throughput:** {throughput.get('requests_per_second', 0):.4f} RPS ({throughput.get('requests_per_hour', 0):.0f} RPH)\n")
        sections.append(f"- **Success Rate:** {reliability.get('success_rate_percent', 0):.4f}%\n")
        sections.append(f"- **Total Records Analyzed:** {reliability.get('total_submissions', 0):,}\n\n")
        
        return sections

    def _generate_latency_analysis(self):
        """Generate latency analysis section with image"""
        sections = [
            "## Latency Analysis\n",
            "Comprehensive latency measurements across all pipeline stages.\n\n"
        ]
        
        latency = self.metrics.get('latency', {}).get('end_to_end_latency_ms', {})
        per_stage = self.metrics.get('latency', {}).get('per_stage_estimate', {})
        
        sections.append("### Latency Statistics\n\n")
        sections.append("| Metric | Value (ms) |\n")
        sections.append("|--------|------------|\n")
        sections.append(f"| Min | {latency.get('min', 0):.2f} |\n")
        sections.append(f"| p50 (Median) | {latency.get('median', 0):.2f} |\n")
        sections.append(f"| p95 | {latency.get('p95', 0):.2f} |\n")
        sections.append(f"| p99 | {latency.get('p99', 0):.2f} |\n")
        sections.append(f"| Max | {latency.get('max', 0):.2f} |\n")
        sections.append(f"| Mean | {latency.get('mean', 0):.2f} |\n")
        sections.append(f"| StdDev | {latency.get('stdev', 0):.2f} |\n\n")
        
        sections.append("### Per-Stage Breakdown\n\n")
        sections.append("| Pipeline Stage | Latency (ms) | % |\n")
        sections.append("|--------|------|---|\n")
        
        if per_stage:
            total = sum(per_stage.values())
            for stage, value in per_stage.items():
                stage_name = stage.replace('_latency_ms', '').replace('_', ' ').title()
                percentage = (value / total * 100) if total > 0 else 0
                sections.append(f"| {stage_name} | {value:.2f} | {percentage:.1f}% |\n")
        
        sections.append("\n")
        sections.append("### Visualization\n\n")
        sections.append(f"![Latency Analysis](latency_analysis.png)\n\n")
        
        return sections

    def _generate_throughput_analysis(self):
        """Generate throughput analysis section with image"""
        sections = [
            "## Throughput Analysis\n",
            "Throughput metrics show request processing rates.\n\n"
        ]
        
        throughput = self.metrics.get('throughput', {})
        
        sections.append("### Throughput Metrics\n\n")
        sections.append("| Metric | Value |\n")
        sections.append("|--------|-------|\n")
        sections.append(f"| Requests Per Second | {throughput.get('requests_per_second', 0):.6f} RPS |\n")
        sections.append(f"| Requests Per Minute | {throughput.get('requests_per_minute', 0):.2f} RPM |\n")
        sections.append(f"| Requests Per Hour | {throughput.get('requests_per_hour', 0):.2f} RPH |\n")
        sections.append(f"| Requests Per Day | {throughput.get('requests_per_day', 0):.2f} RPD |\n")
        sections.append(f"| Total Requests | {int(throughput.get('total_requests', 0)):,} |\n")
        sections.append(f"| Measurement Duration | {throughput.get('measurement_duration_hours', 0):.2f} hours |\n\n")
        
        sections.append("### Visualization\n\n")
        sections.append(f"![Throughput Analysis](throughput_analysis.png)\n\n")
        
        return sections

    def _generate_reliability_analysis(self):
        """Generate reliability analysis section with image"""
        sections = [
            "## Reliability Analysis\n",
            "System stability and error rate measurements.\n\n"
        ]
        
        reliability = self.metrics.get('reliability', {})
        
        sections.append("### Reliability Metrics\n\n")
        sections.append("| Metric | Value |\n")
        sections.append("|--------|-------|\n")
        sections.append(f"| Total Submissions | {int(reliability.get('total_submissions', 0)):,} |\n")
        sections.append(f"| Successful | {int(reliability.get('successful_submissions', 0)):,} |\n")
        sections.append(f"| Failed | {int(reliability.get('failed_submissions', 0)):,} |\n")
        sections.append(f"| Success Rate | {reliability.get('success_rate_percent', 0):.4f}% |\n")
        sections.append(f"| Failure Rate | {reliability.get('failure_rate_percent', 0):.4f}% |\n\n")
        
        mtbf_hours = reliability.get('total_submissions', 1000) / (reliability.get('failed_submissions', 1) + 1)
        sections.append(f"**Mean Time Between Failures (MTBF):** {mtbf_hours:.2f} hours\n\n")
        
        sections.append("### Visualization\n\n")
        sections.append(f"![Reliability Analysis](reliability_analysis.png)\n\n")
        
        return sections

    def _generate_storage_analysis(self):
        """Generate storage analysis section with image"""
        sections = [
            "## Storage Analysis\n",
            "Data persistence and database growth characterization.\n\n"
        ]
        
        storage = self.metrics.get('storage', {})
        throughput = self.metrics.get('throughput', {})
        
        sections.append("### Database Metrics\n\n")
        sections.append("| Metric | Value |\n")
        sections.append("|--------|-------|\n")
        sections.append(f"| Database Name | {storage.get('database_name', 'N/A')} |\n")
        sections.append(f"| Database Size | {storage.get('database_size_text', 'N/A')} |\n")
        sections.append(f"| Total Records | {int(storage.get('total_records', 0)):,} |\n")
        sections.append(f"| Bytes Per Record | {storage.get('estimated_bytes_per_record', 0)} |\n\n")
        
        hours = throughput.get('measurement_duration_hours', 1)
        records_per_hour = (storage.get('total_records', 1000) / hours) if hours > 0 else 0
        bytes_per_hour = records_per_hour * storage.get('estimated_bytes_per_record', 1024)
        mb_per_hour = bytes_per_hour / (1024**2)
        mb_per_day = mb_per_hour * 24
        mb_per_month = mb_per_day * 30
        
        sections.append("### Storage Growth Projection\n\n")
        sections.append("| Time Period | Projected Growth |\n")
        sections.append("|--------|----------------|\n")
        sections.append(f"| Per Hour | {mb_per_hour:.2f} MB |\n")
        sections.append(f"| Per Day | {mb_per_day:.2f} MB |\n")
        sections.append(f"| Per Month | {mb_per_month:.2f} MB |\n")
        sections.append(f"| Per Year | {mb_per_month * 12:.2f} MB |\n\n")
        
        sections.append("### Visualization\n\n")
        sections.append(f"![Storage Analysis](storage_analysis.png)\n\n")
        
        return sections

    def _generate_performance_classification(self):
        """Generate performance classification"""
        sections = [
            "## Performance Classification\n\n"
        ]
        
        latency = self.metrics.get('latency', {}).get('end_to_end_latency_ms', {})
        reliability = self.metrics.get('reliability', {})
        
        p95 = latency.get('p95', 0)
        if p95 < 100:
            latency_class = "**Excellent** (< 100ms)"
        elif p95 < 250:
            latency_class = "**Good** (100-250ms)"
        elif p95 < 500:
            latency_class = "**Fair** (250-500ms)"
        else:
            latency_class = "**Poor** (> 500ms)"
        
        sections.append(f"**Latency (p95):** {latency_class}\n\n")
        
        success_rate = reliability.get('success_rate_percent', 0)
        if success_rate >= 99.99:
            reliability_class = "**Excellent** (≥ 99.99%)"
        elif success_rate >= 99.9:
            reliability_class = "**Very Good** (99.9-99.99%)"
        elif success_rate >= 99.0:
            reliability_class = "**Good** (99-99.9%)"
        elif success_rate >= 95.0:
            reliability_class = "**Fair** (95-99%)"
        else:
            reliability_class = "**Poor** (< 95%)"
        
        sections.append(f"**Reliability:** {reliability_class}\n\n")
        
        return sections

    def _generate_recommendations(self):
        """Generate recommendations"""
        sections = [
            "## Recommendations\n\n"
        ]
        
        latency = self.metrics.get('latency', {})
        per_stage = latency.get('per_stage_estimate', {})
        
        if per_stage:
            bottleneck_stage = max(per_stage, key=per_stage.get)
            bottleneck_time = per_stage[bottleneck_stage]
            bottleneck_percent = (bottleneck_time / sum(per_stage.values())) * 100
            
            stage_name = bottleneck_stage.replace('_latency_ms', '').replace('_', ' ').title()
            sections.append(f"1. **Primary Bottleneck:** {stage_name} ({bottleneck_percent:.1f}% of total latency)\n\n")
        
        throughput = self.metrics.get('throughput', {})
        rps = throughput.get('requests_per_second', 0)
        
        if rps < 1.0:
            sections.append("2. **Throughput Improvement:** Current throughput can be increased\n\n")
        
        reliability = self.metrics.get('reliability', {})
        failure_rate = reliability.get('failure_rate_percent', 0)
        
        if failure_rate > 0.1:
            sections.append("3. **Reliability:** Implement error recovery mechanisms\n\n")
        
        sections.append("4. **Continuous Monitoring:** Track CPU, memory, network, and database metrics\n\n")
        
        return sections

    def _generate_appendix(self):
        """Generate appendix"""
        sections = [
            "## Appendix: Complete Dashboard\n\n",
            f"![Comprehensive Dashboard](comprehensive_dashboard.png)\n\n",
            "### Image References\n\n",
            "All visualizations are included in this report. For thesis integration:\n\n",
            "1. Copy all PNG files from the graphs directory\n",
            "2. Update image paths in this markdown file\n",
            "3. Convert markdown to your thesis format (Word, PDF, LaTeX, etc.)\n",
            "4. Tables are ready to copy directly into your document\n\n",
            "---\n\n",
            f"*Report generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n"
        ]
        
        return sections

def main():
    parser = argparse.ArgumentParser(description='IoT Pipeline Metrics Report Generator')
    parser.add_argument('--input', default='iot_pipeline_metrics.json', help='Input metrics JSON file')
    parser.add_argument('--output', default='iot_pipeline_report.md', help='Output markdown report file')
    parser.add_argument('--graphs-dir', default=None, help='Graphs directory (auto-detected if not provided)')
    
    args = parser.parse_args()
    
    generator = IoTMetricsReportGenerator(args.input, args.output, args.graphs_dir)
    generator.generate_report()
    print(f"✅ Report generation complete!")

if __name__ == '__main__':
    main()
