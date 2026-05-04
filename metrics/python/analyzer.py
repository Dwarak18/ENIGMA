#!/usr/bin/env python3
"""
Analyze ENIGMA metrics data and generate performance report.

Identifies bottlenecks, calculates percentiles, and provides recommendations.

Usage:
  python analyzer.py --input ../data/sample_metrics.json --report ../docs/analysis_report.md
"""

import json
import statistics
import sys
from pathlib import Path
from datetime import datetime


def load_metrics(filepath):
    """Load metrics JSON file."""
    with open(filepath) as f:
        return json.load(f)


def calculate_percentiles(values):
    """Calculate p50, p95, p99 for a list of values."""
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    
    return {
        'min': min(values),
        'p50': sorted_vals[int(n * 0.50)],
        'p95': sorted_vals[int(n * 0.95)],
        'p99': sorted_vals[int(n * 0.99)],
        'max': max(values),
        'mean': statistics.mean(values),
        'stdev': statistics.stdev(values) if len(values) > 1 else 0,
    }


def analyze_metrics(data):
    """Perform comprehensive analysis of metrics data."""
    
    successful = [d for d in data if d['backend']['status'] == 'success']
    failed = [d for d in data if d['backend']['status'] != 'success']
    
    analysis = {
        'timestamp': datetime.now().isoformat(),
        'total_runs': len(data),
        'successful_runs': len(successful),
        'failed_runs': len(failed),
        'success_rate': (len(successful) / len(data) * 100) if data else 0,
    }
    
    if not successful:
        return analysis
    
    # E2E Latency
    e2e_latencies = [d['end_to_end_ms'] for d in successful]
    analysis['end_to_end'] = calculate_percentiles(e2e_latencies)
    
    # Firmware breakdown
    fw_encrypts = [d['firmware']['encrypt_ms'] for d in successful]
    fw_hashes = [d['firmware']['hash_ms'] for d in successful]
    fw_totals = [d['firmware']['total_ms'] for d in successful]
    
    analysis['firmware'] = {
        'encrypt': calculate_percentiles(fw_encrypts),
        'hash': calculate_percentiles(fw_hashes),
        'total': calculate_percentiles(fw_totals),
    }
    
    # Network
    net_latencies = [d['network']['total_latency_ms'] for d in successful]
    analysis['network'] = calculate_percentiles(net_latencies)
    
    # Backend
    be_validations = [d['backend']['validation_ms'] for d in successful]
    be_sigs = [d['backend']['signature_verify_ms'] for d in successful]
    be_dbs = [d['backend']['db_insert_ms'] for d in successful]
    be_totals = [d['backend']['total_ms'] for d in successful]
    
    analysis['backend'] = {
        'validation': calculate_percentiles(be_validations),
        'signature_verify': calculate_percentiles(be_sigs),
        'db_insert': calculate_percentiles(be_dbs),
        'total': calculate_percentiles(be_totals),
    }
    
    # Bottleneck analysis
    analysis['bottlenecks'] = identify_bottlenecks(analysis, data)
    
    # Failure analysis
    if failed:
        failure_codes = {}
        for d in failed:
            code = d['backend']['error_code']
            failure_codes[code] = failure_codes.get(code, 0) + 1
        analysis['failures'] = failure_codes
    
    return analysis


def identify_bottlenecks(analysis, data):
    """Identify performance bottlenecks."""
    bottlenecks = []
    
    # Check E2E latency
    if analysis['end_to_end']['p50'] > 200:
        bottlenecks.append({
            'severity': 'CRITICAL' if analysis['end_to_end']['p50'] > 500 else 'HIGH',
            'issue': f"High median E2E latency: {analysis['end_to_end']['p50']:.0f}ms",
            'recommendation': 'Investigate firmware, network, and backend latencies'
        })
    
    # Check firmware
    fw_pct = (analysis['firmware']['total']['mean'] / 
              analysis['end_to_end']['mean']) * 100
    if fw_pct > 50:
        bottlenecks.append({
            'severity': 'HIGH',
            'issue': f"Firmware dominates latency: {fw_pct:.1f}% of total",
            'recommendation': 'Check AES encryption or SHA-256 hashing performance'
        })
    
    # Check network
    net_pct = (analysis['network']['mean'] / 
               analysis['end_to_end']['mean']) * 100
    if net_pct > 50:
        bottlenecks.append({
            'severity': 'HIGH',
            'issue': f"Network dominates latency: {net_pct:.1f}% of total",
            'recommendation': 'Check WiFi signal strength and UART baud rate'
        })
    
    # Check backend
    be_pct = (analysis['backend']['total']['mean'] / 
              analysis['end_to_end']['mean']) * 100
    if be_pct > 40:
        bottlenecks.append({
            'severity': 'MEDIUM',
            'issue': f"Backend processing significant: {be_pct:.1f}% of total",
            'recommendation': 'Profile signature verification and DB insert'
        })
    
    # Check tail latency
    if analysis['end_to_end']['p99'] > analysis['end_to_end']['p50'] * 3:
        bottlenecks.append({
            'severity': 'MEDIUM',
            'issue': f"High tail latency: p99={analysis['end_to_end']['p99']:.0f}ms vs p50={analysis['end_to_end']['p50']:.0f}ms",
            'recommendation': 'Check for intermittent network issues or GC pauses'
        })
    
    # Check signature verify
    if analysis['backend']['signature_verify']['mean'] > 20:
        bottlenecks.append({
            'severity': 'MEDIUM',
            'issue': f"Slow signature verification: {analysis['backend']['signature_verify']['mean']:.0f}ms",
            'recommendation': 'Implement caching or use faster crypto library'
        })
    
    # Check failure rate
    success_rate = sum(1 for d in data if d['backend']['status'] == 'success') / len(data) * 100
    if success_rate < 99:
        bottlenecks.append({
            'severity': 'MEDIUM',
            'issue': f"High failure rate: {100-success_rate:.1f}% of requests failed",
            'recommendation': 'Check error logs for root cause (replay, stale timestamp, etc)'
        })
    
    return bottlenecks


def format_report(analysis):
    """Format analysis as markdown report."""
    
    lines = [
        '# ENIGMA Performance Analysis Report',
        '',
        f'**Generated**: {analysis["timestamp"]}',
        '',
        '---',
        '',
        '## Executive Summary',
        '',
        f'- **Total Runs**: {analysis["total_runs"]}',
        f'- **Success Rate**: {analysis["success_rate"]:.1f}%',
        f'- **Median E2E Latency**: {analysis.get("end_to_end", {}).get("p50", "N/A"):.0f}ms',
        f'- **P95 E2E Latency**: {analysis.get("end_to_end", {}).get("p95", "N/A"):.0f}ms',
        f'- **P99 E2E Latency**: {analysis.get("end_to_end", {}).get("p99", "N/A"):.0f}ms',
        '',
    ]
    
    # Bottlenecks
    if analysis.get('bottlenecks'):
        lines.extend([
            '## Identified Bottlenecks',
            '',
        ])
        for i, b in enumerate(analysis['bottlenecks'], 1):
            lines.extend([
                f'### {i}. [{b["severity"]}] {b["issue"]}',
                f'**Recommendation**: {b["recommendation"]}',
                '',
            ])
    else:
        lines.extend([
            '## Bottlenecks',
            '',
            'No significant bottlenecks identified. Performance is good.',
            '',
        ])
    
    # Detailed metrics
    if analysis.get('end_to_end'):
        lines.extend([
            '## End-to-End Latency',
            '',
            '| Metric | Value |',
            '|--------|-------|',
            f'| Min | {analysis["end_to_end"]["min"]:.0f}ms |',
            f'| p50 (Median) | {analysis["end_to_end"]["p50"]:.0f}ms |',
            f'| Mean | {analysis["end_to_end"]["mean"]:.0f}ms |',
            f'| p95 | {analysis["end_to_end"]["p95"]:.0f}ms |',
            f'| p99 | {analysis["end_to_end"]["p99"]:.0f}ms |',
            f'| Max | {analysis["end_to_end"]["max"]:.0f}ms |',
            f'| StdDev | {analysis["end_to_end"]["stdev"]:.0f}ms |',
            '',
        ])
    
    # Firmware breakdown
    if analysis.get('firmware'):
        fw = analysis['firmware']
        lines.extend([
            '## Firmware Latency Breakdown',
            '',
            f'**Total**: p50={fw["total"]["p50"]:.0f}ms, p95={fw["total"]["p95"]:.0f}ms',
            f'- **AES Encrypt**: p50={fw["encrypt"]["p50"]:.0f}ms, p95={fw["encrypt"]["p95"]:.0f}ms',
            f'- **SHA-256**: p50={fw["hash"]["p50"]:.0f}ms, p95={fw["hash"]["p95"]:.0f}ms',
            '',
        ])
    
    # Network
    if analysis.get('network'):
        lines.extend([
            '## Network Latency',
            '',
            f'**Total Network**: p50={analysis["network"]["p50"]:.0f}ms, p95={analysis["network"]["p95"]:.0f}ms',
            '',
        ])
    
    # Backend
    if analysis.get('backend'):
        be = analysis['backend']
        lines.extend([
            '## Backend Processing',
            '',
            f'**Total**: p50={be["total"]["p50"]:.0f}ms, p95={be["total"]["p95"]:.0f}ms',
            f'- **Validation**: p50={be["validation"]["p50"]:.0f}ms, p95={be["validation"]["p95"]:.0f}ms',
            f'- **Signature Verify**: p50={be["signature_verify"]["p50"]:.0f}ms, p95={be["signature_verify"]["p95"]:.0f}ms',
            f'- **DB Insert**: p50={be["db_insert"]["p50"]:.0f}ms, p95={be["db_insert"]["p95"]:.0f}ms',
            '',
        ])
    
    # Failures
    if analysis.get('failures'):
        lines.extend([
            '## Failure Analysis',
            '',
            '| Error Code | Count |',
            '|-----------|-------|',
        ])
        for code, count in analysis['failures'].items():
            lines.append(f'| {code} | {count} |')
        lines.append('')
    
    # Recommendations
    lines.extend([
        '## Recommendations',
        '',
        '1. **Compare against benchmarks** in `performance-guide.md` to assess overall health',
        '2. **Graph visualization** plots show trends and distribution details',
        '3. **Focus on P95/P99** for production SLO planning',
        '4. **Monitor trends** over time by running analysis weekly',
        '',
    ])
    
    return '\n'.join(lines)


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Analyze ENIGMA metrics data and generate report'
    )
    parser.add_argument(
        '--input', type=str, required=True,
        help='Input JSON metrics file'
    )
    parser.add_argument(
        '--report', type=str, default='../docs/analysis_report.md',
        help='Output report file (default: ../docs/analysis_report.md)'
    )
    
    args = parser.parse_args()
    
    # Load and analyze
    input_path = Path(args.input)
    if not input_path.exists():
        print(f'✗ Error: Input file not found: {input_path}')
        sys.exit(1)
    
    print(f'Loading metrics from {input_path}...')
    data = load_metrics(input_path)
    print(f'Analyzing {len(data)} metrics records...')
    
    analysis = analyze_metrics(data)
    report = format_report(analysis)
    
    # Write report
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, 'w') as f:
        f.write(report)
    
    print(f'✓ Report written to {report_path}')
    
    # Print summary to stdout
    print('\n' + '='*60)
    print('QUICK SUMMARY')
    print('='*60)
    print(f'Success Rate: {analysis["success_rate"]:.1f}%')
    print(f'Median E2E: {analysis.get("end_to_end", {}).get("p50", "N/A"):.0f}ms')
    print(f'P95 E2E: {analysis.get("end_to_end", {}).get("p95", "N/A"):.0f}ms')
    
    if analysis.get('bottlenecks'):
        print(f'\nBottlenecks found: {len(analysis["bottlenecks"])}')
        for b in analysis['bottlenecks']:
            print(f'  [{b["severity"]}] {b["issue"]}')
    else:
        print('\nNo critical bottlenecks identified.')


if __name__ == '__main__':
    main()
